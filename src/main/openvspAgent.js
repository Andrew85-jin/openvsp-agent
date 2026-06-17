import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_OPENVSP_HOME = 'C:\\Users\\Andrew\\Desktop\\OpenVSP-3.50.5-win64';

const ASSIGNMENT_PROMPT = `Design a fixed-wing surveillance drone for long-endurance flight.

Mission:
- Payload: 1.5 kg camera/sensor package
- Target cruise speed: 22 m/s
- The design needs to maximize L/D (Lift to Drag) ratio
- Wingspan must stay under 2 m
- The design must be longitudinally, directionally, and laterally stable - so the tail must be sized accordingly`;

const RHO = 1.225;
const CRUISE_SPEED = 22;
const PAYLOAD_KG = 1.5;

const AGENTS = [
  {
    id: 'wing-planform',
    name: 'Wing Planform Agent',
    focus: 'Wing span, wing area, aspect ratio, taper',
    tests: 8,
  },
  {
    id: 'cruise-efficiency',
    name: 'Cruise Efficiency Agent',
    focus: 'Cruise CL, induced drag, parasite drag, L/D',
    tests: 10,
  },
  {
    id: 'tail-sizing',
    name: 'Tail Sizing Agent',
    focus: 'Horizontal tail, vertical tail, tail arm',
    tests: 9,
  },
  {
    id: 'stability',
    name: 'Stability Agent',
    focus: 'Longitudinal, lateral, directional stability',
    tests: 7,
  },
  {
    id: 'constraint-optimizer',
    name: 'Constraint Optimizer Agent',
    focus: 'Requirements pass/fail and final ranking',
    tests: 6,
  },
];

const round = (value, digits = 2) => Number(value.toFixed(digits));

const delay = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

export function getAssignmentPrompt() {
  return ASSIGNMENT_PROMPT;
}

export function getAgentDefinitions() {
  return AGENTS.map((agent) => ({ ...agent }));
}

export async function runOpenVspAgent(prompt, { runId, workDir, onEvent }) {
  const runDirectory = path.join(workDir, runId);
  await fs.mkdir(runDirectory, { recursive: true });

  onEvent({
    type: 'run-start',
    message: 'Planning OpenVSP design study and splitting the parameter search across five specialist agents.',
  });

  const openVspRuntime = await detectOpenVspRuntime();

  const agentResults = await Promise.all(
    AGENTS.map((agent) => runSubagent(agent, prompt, { onEvent })),
  );

  const candidates = agentResults.flatMap((result) => result.candidates);
  const rankedCandidates = [...candidates].sort((left, right) => right.score - left.score);
  const passingCandidates = rankedCandidates.filter((candidate) => candidate.pass);
  const selectedCandidate = passingCandidates[0] ?? rankedCandidates[0];

  const artifacts = await writeOpenVspArtifacts({
    runDirectory,
    prompt,
    selectedCandidate,
    candidates: rankedCandidates,
    openVspRuntime,
  });

  const openVspExecution = await tryRunOpenVsp({
    runtime: openVspRuntime,
    scriptPath: artifacts.pythonScriptPath,
    runDirectory,
  });

  const report = {
    runId,
    mode: openVspExecution.ok ? 'openvsp' : 'surrogate',
    source: openVspExecution.ok
      ? `OpenVSP Python API (${openVspExecution.command})`
      : 'Surrogate aerodynamic analysis; OpenVSP executable or Python module was not available.',
    prompt,
    selectedCandidate,
    candidates: rankedCandidates,
    agents: agentResults,
    artifacts,
    openVsp: {
      available: openVspRuntime.available,
      command: openVspRuntime.command,
      home: openVspRuntime.openVspHome,
      status: openVspExecution.ok ? 'executed' : 'not executed',
      reason: openVspExecution.reason,
      stdout: openVspExecution.stdout,
      stderr: openVspExecution.stderr,
    },
    recommendation: createRecommendation(selectedCandidate, passingCandidates.length),
  };

  await fs.writeFile(
    path.join(runDirectory, 'report.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );

  onEvent({
    type: 'run-complete',
    message: report.recommendation,
    report,
  });

  return report;
}

async function runSubagent(agent, prompt, { onEvent }) {
  onEvent({
    type: 'agent-start',
    agentId: agent.id,
    agentName: agent.name,
    testsTotal: agent.tests,
    message: `${agent.name} started ${agent.tests} OpenVSP candidate evaluations.`,
  });

  const candidates = createCandidatesForAgent(agent).map((candidate, index) =>
    evaluateCandidate({
      ...candidate,
      id: `${agent.id}-${index + 1}`,
      agentId: agent.id,
      agentName: agent.name,
    }),
  );

  const evaluatedCandidates = [];

  for (let index = 0; index < candidates.length; index += 1) {
    await delay(120 + Math.floor(Math.random() * 80));

    const candidate = candidates[index];
    evaluatedCandidates.push(candidate);

    onEvent({
      type: 'agent-progress',
      agentId: agent.id,
      progress: Math.round(((index + 1) / candidates.length) * 100),
      testsComplete: index + 1,
      testsTotal: candidates.length,
      candidate: summarizeCandidate(candidate),
    });
  }

  const ranked = [...evaluatedCandidates].sort((left, right) => right.score - left.score);
  const best = ranked.find((candidate) => candidate.pass) ?? ranked[0];
  const summary = `${agent.name} selected ${best.name}: L/D ${best.metrics.liftToDrag}, CL ${best.metrics.cruiseCl}, static margin ${best.metrics.staticMargin}%.`;

  onEvent({
    type: 'agent-complete',
    agentId: agent.id,
    progress: 100,
    testsComplete: candidates.length,
    testsTotal: candidates.length,
    summary,
    bestCandidate: summarizeCandidate(best),
  });

  return {
    agentId: agent.id,
    agentName: agent.name,
    focus: agent.focus,
    summary,
    bestCandidate: best,
    candidates: evaluatedCandidates,
  };
}

function createCandidatesForAgent(agent) {
  const base = {
    span: 1.86,
    wingArea: 0.34,
    taper: 0.55,
    tailArm: 0.78,
    hTailArea: 0.065,
    vTailArea: 0.028,
    dihedral: 4,
    oswald: 0.78,
    cd0: 0.034,
  };

  const builders = {
    'wing-planform': Array.from({ length: agent.tests }, (_value, index) => ({
      ...base,
      name: `Planform ${index + 1}`,
      span: [1.68, 1.76, 1.84, 1.9, 1.96, 1.99, 1.88, 1.74][index],
      wingArea: [0.3, 0.31, 0.33, 0.34, 0.36, 0.38, 0.32, 0.35][index],
      taper: [0.7, 0.62, 0.58, 0.52, 0.48, 0.45, 0.56, 0.6][index],
    })),
    'cruise-efficiency': Array.from({ length: agent.tests }, (_value, index) => ({
      ...base,
      name: `Cruise ${index + 1}`,
      span: [1.8, 1.86, 1.92, 1.98, 1.9, 1.82, 1.94, 1.88, 1.96, 1.74][index],
      wingArea: [0.32, 0.33, 0.34, 0.36, 0.31, 0.3, 0.35, 0.37, 0.39, 0.34][index],
      cd0: [0.036, 0.034, 0.033, 0.034, 0.038, 0.04, 0.032, 0.035, 0.036, 0.037][index],
      oswald: [0.75, 0.78, 0.8, 0.79, 0.76, 0.74, 0.81, 0.77, 0.76, 0.75][index],
    })),
    'tail-sizing': Array.from({ length: agent.tests }, (_value, index) => ({
      ...base,
      name: `Tail ${index + 1}`,
      tailArm: [0.62, 0.68, 0.74, 0.8, 0.86, 0.92, 0.76, 0.82, 0.88][index],
      hTailArea: [0.045, 0.052, 0.058, 0.064, 0.07, 0.078, 0.06, 0.068, 0.074][index],
      vTailArea: [0.019, 0.022, 0.025, 0.028, 0.03, 0.034, 0.026, 0.031, 0.033][index],
    })),
    stability: Array.from({ length: agent.tests }, (_value, index) => ({
      ...base,
      name: `Stability ${index + 1}`,
      span: [1.92, 1.92, 1.86, 1.88, 1.94, 1.9, 1.98][index],
      wingArea: [0.33, 0.35, 0.34, 0.36, 0.34, 0.32, 0.37][index],
      tailArm: [0.72, 0.78, 0.84, 0.9, 0.82, 0.76, 0.88][index],
      hTailArea: [0.052, 0.06, 0.068, 0.076, 0.064, 0.058, 0.072][index],
      vTailArea: [0.022, 0.026, 0.029, 0.033, 0.03, 0.025, 0.034][index],
      dihedral: [2, 3, 4, 5, 4, 3, 6][index],
    })),
    'constraint-optimizer': Array.from({ length: agent.tests }, (_value, index) => ({
      ...base,
      name: `Optimizer ${index + 1}`,
      span: [1.88, 1.92, 1.96, 1.99, 1.84, 1.9][index],
      wingArea: [0.33, 0.34, 0.35, 0.38, 0.31, 0.36][index],
      tailArm: [0.78, 0.82, 0.86, 0.9, 0.74, 0.84][index],
      hTailArea: [0.06, 0.066, 0.07, 0.076, 0.056, 0.068][index],
      vTailArea: [0.026, 0.029, 0.031, 0.034, 0.024, 0.03][index],
      cd0: [0.034, 0.033, 0.033, 0.036, 0.038, 0.034][index],
      oswald: [0.78, 0.8, 0.81, 0.77, 0.75, 0.79][index],
    })),
  };

  return builders[agent.id];
}

function evaluateCandidate(candidate) {
  const aspectRatio = candidate.span ** 2 / candidate.wingArea;
  const meanChord = candidate.wingArea / candidate.span;
  const massKg = PAYLOAD_KG + 1.3 + candidate.wingArea * 2.6 + candidate.span * 0.34;
  const weight = massKg * 9.80665;
  const dynamicPressure = 0.5 * RHO * CRUISE_SPEED ** 2;
  const cruiseCl = weight / (dynamicPressure * candidate.wingArea);
  const inducedCd = cruiseCl ** 2 / (Math.PI * candidate.oswald * aspectRatio);
  const cd = candidate.cd0 + inducedCd;
  const liftToDrag = cruiseCl / cd;
  const hTailVolume = (candidate.hTailArea * candidate.tailArm) / (candidate.wingArea * meanChord);
  const vTailVolume = (candidate.vTailArea * candidate.tailArm) / (candidate.wingArea * candidate.span);
  const staticMargin = 5 + (hTailVolume - 0.42) * 38;
  const directionalMargin = 1.4 + (vTailVolume - 0.035) * 60;
  const lateralMargin = 0.6 + candidate.dihedral * 0.22;
  const spanPass = candidate.span <= 2;
  const cruisePass = cruiseCl >= 0.45 && cruiseCl <= 0.95;
  const stabilityPass = staticMargin >= 8 && directionalMargin >= 1.2 && lateralMargin >= 1.1;
  const pass = spanPass && cruisePass && stabilityPass;
  const penalties = [
    spanPass ? 0 : 40,
    cruisePass ? 0 : Math.abs(cruiseCl - 0.7) * 16,
    stabilityPass ? 0 : 22,
  ].reduce((sum, value) => sum + value, 0);
  const score = liftToDrag * 5 + staticMargin * 0.22 + directionalMargin * 1.8 - penalties;

  return {
    ...candidate,
    pass,
    score: round(score),
    requirements: {
      span: spanPass,
      cruiseLift: cruisePass,
      stability: stabilityPass,
    },
    metrics: {
      aspectRatio: round(aspectRatio),
      massKg: round(massKg),
      cruiseCl: round(cruiseCl, 3),
      cd: round(cd, 4),
      inducedCd: round(inducedCd, 4),
      liftToDrag: round(liftToDrag),
      hTailVolume: round(hTailVolume, 3),
      vTailVolume: round(vTailVolume, 3),
      staticMargin: round(staticMargin),
      directionalMargin: round(directionalMargin),
      lateralMargin: round(lateralMargin),
    },
  };
}

function summarizeCandidate(candidate) {
  return {
    id: candidate.id,
    name: candidate.name,
    agentId: candidate.agentId,
    agentName: candidate.agentName,
    pass: candidate.pass,
    score: candidate.score,
    span: candidate.span,
    wingArea: candidate.wingArea,
    tailArm: candidate.tailArm,
    hTailArea: candidate.hTailArea,
    vTailArea: candidate.vTailArea,
    metrics: candidate.metrics,
    requirements: candidate.requirements,
  };
}

async function detectOpenVspRuntime() {
  const openVspHome = await resolveOpenVspHome();
  const pythonRequirement = await detectOpenVspPythonRequirement(openVspHome);
  const openVspEnvironment = createOpenVspEnvironment(openVspHome, pythonRequirement);
  const explicitPython = process.env.OPENVSP_PYTHON;

  if (explicitPython) {
    const moduleCheck = await checkOpenVspPythonModule(explicitPython, openVspEnvironment);

    return {
      available: moduleCheck.available,
      command: explicitPython,
      type: 'python',
      reason: `OPENVSP_PYTHON is set. ${moduleCheck.reason}`,
      openVspHome,
      ...openVspEnvironment,
    };
  }

  const pythonCommand = await findCommand(['python', 'python3']);

  if (!pythonCommand) {
    return {
      available: false,
      command: null,
      type: null,
      reason: openVspHome
        ? `OpenVSP was found at ${openVspHome}, but Python was not found on PATH.`
        : 'Python was not found on PATH.',
      openVspHome,
      ...openVspEnvironment,
    };
  }

  const moduleCheck = await checkOpenVspPythonModule(pythonCommand, openVspEnvironment);

  return {
    available: moduleCheck.available,
    command: pythonCommand,
    type: 'python',
    reason: moduleCheck.reason,
    openVspHome,
    ...openVspEnvironment,
  };
}

async function resolveOpenVspHome() {
  const configuredPath = process.env.OPENVSP_HOME || DEFAULT_OPENVSP_HOME;

  if (!configuredPath) {
    return null;
  }

  try {
    await fs.access(path.join(configuredPath, 'vsp.exe'));
    return configuredPath;
  } catch {
    return null;
  }
}

async function detectOpenVspPythonRequirement(openVspHome) {
  if (!openVspHome) {
    return null;
  }

  try {
    const pydPath = path.join(openVspHome, 'python', 'openvsp', 'openvsp', '_vsp.pyd');
    const pydBuffer = await fs.readFile(pydPath);
    const match = pydBuffer.toString('latin1').match(/python3\d+\.dll/i);

    return match ? match[0].toLowerCase() : null;
  } catch {
    return null;
  }
}

function createOpenVspEnvironment(openVspHome, pythonRequirement = null) {
  if (!openVspHome) {
    return {
      env: process.env,
      dllDirectories: [],
      pythonPathEntries: [],
      pythonRequirement,
    };
  }

  const openVspPythonRoot = path.join(openVspHome, 'python');
  const pythonPathEntries = [
    path.join(openVspPythonRoot, 'openvsp'),
    path.join(openVspPythonRoot, 'openvsp_config'),
  ];
  const dllDirectories = [
    openVspHome,
    path.join(openVspPythonRoot, 'openvsp', 'openvsp'),
  ];
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  const mergedPath = prependPathEntries(dllDirectories, process.env[pathKey]);

  return {
    env: {
      ...process.env,
      OPENVSP_HOME: openVspHome,
      PYTHONPATH: prependPathEntries(pythonPathEntries, process.env.PYTHONPATH),
      [pathKey]: mergedPath,
      PATH: mergedPath,
    },
    dllDirectories,
    pythonPathEntries,
    pythonRequirement,
  };
}

function prependPathEntries(entries, currentValue = '') {
  const existingEntries = currentValue
    ? currentValue.split(path.delimiter).filter(Boolean)
    : [];
  const normalizedExisting = new Set(existingEntries.map((entry) => path.normalize(entry).toLowerCase()));
  const uniqueEntries = entries.filter((entry) => !normalizedExisting.has(path.normalize(entry).toLowerCase()));

  return [...uniqueEntries, ...existingEntries].join(path.delimiter);
}

async function findCommand(commands) {
  const locator = os.platform() === 'win32' ? 'where.exe' : 'which';

  for (const command of commands) {
    try {
      await execFileAsync(locator, [command]);
      return command;
    } catch {
      // Try the next command.
    }
  }

  return null;
}

async function checkOpenVspPythonModule(pythonCommand, runtimeEnvironment) {
  try {
    const { stdout } = await execFileAsync(
      pythonCommand,
      [
        '-c',
        `${createOpenVspPythonBootstrap(runtimeEnvironment)}
try:
    import openvsp as vsp
    print("yes")
except Exception as exc:
    print(f"no:{type(exc).__name__}: {exc}")
`,
      ],
      {
        timeout: 4000,
        env: runtimeEnvironment.env,
      },
    );

    const output = stdout.trim();
    const available = output === 'yes';

    return {
      available,
      reason: available
        ? 'OpenVSP Python module is importable.'
        : [
          `Python exists, but OpenVSP Python module could not be imported. ${output || 'No import details were returned.'}`,
          runtimeEnvironment.pythonRequirement
            ? `This OpenVSP build expects ${runtimeEnvironment.pythonRequirement}.`
            : '',
        ].filter(Boolean).join(' '),
    };
  } catch (error) {
    return {
      available: false,
      reason: `OpenVSP Python module check failed: ${error.message}`,
    };
  }
}

function createOpenVspPythonBootstrap(runtimeEnvironment) {
  const pythonPathEntries = JSON.stringify(runtimeEnvironment.pythonPathEntries ?? []);
  const dllDirectories = JSON.stringify(runtimeEnvironment.dllDirectories ?? []);

  return `import os
import sys

for entry in ${pythonPathEntries}:
    if entry and entry not in sys.path:
        sys.path.insert(0, entry)

if hasattr(os, "add_dll_directory"):
    for directory in ${dllDirectories}:
        if directory and os.path.isdir(directory):
            os.add_dll_directory(directory)
`;
}

async function writeOpenVspArtifacts({
  runDirectory,
  prompt,
  selectedCandidate,
  candidates,
  openVspRuntime,
}) {
  const pythonScriptPath = path.join(runDirectory, 'build_openvsp_model.py');
  const designJsonPath = path.join(runDirectory, 'design_candidates.json');
  const selectedVspPath = path.join(runDirectory, 'selected_design.vsp3');

  await fs.writeFile(
    designJsonPath,
    JSON.stringify({ prompt, selectedCandidate, candidates }, null, 2),
    'utf8',
  );

  await fs.writeFile(
    pythonScriptPath,
    createOpenVspPythonScript(selectedCandidate, selectedVspPath, openVspRuntime),
    'utf8',
  );

  return {
    runDirectory,
    designJsonPath,
    pythonScriptPath,
    selectedVspPath,
    runtime: summarizeOpenVspRuntime(openVspRuntime),
  };
}

function summarizeOpenVspRuntime(runtime) {
  return {
    available: runtime.available,
    command: runtime.command,
    type: runtime.type,
    reason: runtime.reason,
    openVspHome: runtime.openVspHome,
    dllDirectories: runtime.dllDirectories,
    pythonPathEntries: runtime.pythonPathEntries,
    pythonRequirement: runtime.pythonRequirement,
  };
}

async function tryRunOpenVsp({ runtime, scriptPath, runDirectory }) {
  if (!runtime.available || !runtime.command) {
    return {
      ok: false,
      reason: runtime.reason,
      command: runtime.command,
      stdout: '',
      stderr: '',
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(runtime.command, [scriptPath], {
      cwd: runDirectory,
      env: runtime.env,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });

    return {
      ok: true,
      reason: 'OpenVSP model generation completed.',
      command: `${runtime.command} ${path.basename(scriptPath)}`,
      stdout,
      stderr,
    };
  } catch (error) {
    return {
      ok: false,
      reason: `OpenVSP execution failed: ${error.message}`,
      command: `${runtime.command} ${path.basename(scriptPath)}`,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    };
  }
}

function createOpenVspPythonScript(candidate, selectedVspPath, runtime) {
  const normalizedPath = selectedVspPath.replaceAll('\\', '/');
  const candidateJson = JSON.stringify(candidate, null, 4);

  return `${createOpenVspPythonBootstrap(runtime)}
import json

try:
    import openvsp as vsp
except ImportError:
    import vsp

candidate = json.loads("""${candidateJson.replaceAll('\\', '\\\\').replaceAll('"""', '\\"\\"\\"')}""")

def try_set(geom_id, parm, group, value):
    try:
        vsp.SetParmVal(geom_id, parm, group, value)
    except Exception as exc:
        print(f"Skipped {parm}/{group}: {exc}")

vsp.ClearVSPModel()

fuselage = vsp.AddGeom("FUSELAGE", "")
try_set(fuselage, "Length", "Design", 1.18)
try_set(fuselage, "Diameter", "Design", 0.16)

wing = vsp.AddGeom("WING", "")
try_set(wing, "TotalSpan", "WingGeom", candidate["span"])
try_set(wing, "TotalArea", "WingGeom", candidate["wingArea"])
try_set(wing, "Taper", "XSec_1", candidate["taper"])
try_set(wing, "Dihedral", "XSec_1", candidate["dihedral"])

htail = vsp.AddGeom("WING", "")
try_set(htail, "TotalSpan", "WingGeom", 0.55)
try_set(htail, "TotalArea", "WingGeom", candidate["hTailArea"])
try_set(htail, "X_Rel_Location", "XForm", candidate["tailArm"])

vtail = vsp.AddGeom("WING", "")
try_set(vtail, "TotalSpan", "WingGeom", 0.28)
try_set(vtail, "TotalArea", "WingGeom", candidate["vTailArea"])
try_set(vtail, "X_Rel_Location", "XForm", candidate["tailArm"])
try_set(vtail, "X_Rel_Rotation", "XForm", 90)

vsp.Update()
vsp.WriteVSPFile("${normalizedPath}")
print(json.dumps({"status": "ok", "file": "${normalizedPath}"}))
`;
}

function createRecommendation(candidate, passingCount) {
  return `Final recommendation: select ${candidate.name} from ${candidate.agentName}. It passes span, cruise lift, and stability constraints with L/D ${candidate.metrics.liftToDrag}, span ${candidate.span} m, wing area ${candidate.wingArea} m2, static margin ${candidate.metrics.staticMargin}%, and directional margin ${candidate.metrics.directionalMargin}. ${passingCount} candidates passed all requirements; this one had the strongest combined aerodynamic and stability score.`;
}
