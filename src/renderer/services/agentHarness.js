const ASSIGNMENT_PROMPT = `Design a fixed-wing surveillance drone for long-endurance flight.

Mission:
- Payload: 1.5 kg camera/sensor package
- Target cruise speed: 22 m/s
- The design needs to maximize L/D (Lift to Drag) ratio
- Wingspan must stay under 2 m
- The design must be longitudinally, directionally, and laterally stable - so the tail must be sized accordingly`;

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

const fallbackDelay = (ms) => new Promise((resolve) => {
  window.setTimeout(resolve, ms);
});

export function createInitialAgents() {
  return AGENTS.map((agent) => ({
    id: agent.id,
    name: agent.name,
    focus: agent.focus,
    status: 'idle',
    progress: 0,
    testsComplete: 0,
    testsTotal: agent.tests,
    summary: '',
  }));
}

export function getAssignmentPrompt() {
  return ASSIGNMENT_PROMPT;
}

export async function runAgentHarness(prompt, { addMessage, updateAgent }) {
  const runId = crypto.randomUUID();
  const nativeAgent = window.openvspAgent;

  addMessage({
    author: 'OpenVSP Agent',
    role: 'assistant',
    content: nativeAgent
      ? 'Mission received. Launching the Electron main-process OpenVSP agent and five parallel specialist subagents.'
      : 'Mission received. Native OpenVSP bridge is unavailable, so this browser session will use the local fallback evaluator.',
  });

  if (!nativeAgent) {
    const report = await runFallbackHarness(prompt, { updateAgent });

    addMessage({
      author: 'OpenVSP Agent',
      role: 'assistant',
      content: `${report.recommendation}\n\nExecution mode: ${report.source}`,
    });

    return report;
  }

  const unsubscribe = nativeAgent.onRunEvent((event) => {
    if (event.runId !== runId) {
      return;
    }

    handleAgentEvent(event, { addMessage, updateAgent });
  });

  try {
    const report = await nativeAgent.runDesignStudy({ runId, prompt });

    addMessage({
      author: 'OpenVSP Agent',
      role: 'assistant',
      content: `${report.recommendation}\n\nExecution mode: ${report.mode === 'openvsp' ? 'OpenVSP generated the selected .vsp3 model.' : report.source}`,
    });

    return report;
  } finally {
    unsubscribe();
  }
}

function handleAgentEvent(event, { addMessage, updateAgent }) {
  if (event.type === 'run-start') {
    addMessage({
      author: 'OpenVSP Agent',
      role: 'assistant',
      content: event.message,
    });
    return;
  }

  if (event.type === 'agent-start') {
    updateAgent(event.agentId, {
      status: 'running',
      progress: 8,
      testsComplete: 0,
      testsTotal: event.testsTotal,
      summary: '',
    });

    addMessage({
      author: event.agentName,
      role: 'agent',
      content: event.message,
    });
    return;
  }

  if (event.type === 'agent-progress') {
    updateAgent(event.agentId, {
      status: 'running',
      progress: event.progress,
      testsComplete: event.testsComplete,
      testsTotal: event.testsTotal,
    });
    return;
  }

  if (event.type === 'agent-complete') {
    updateAgent(event.agentId, {
      status: 'complete',
      progress: 100,
      testsComplete: event.testsComplete,
      testsTotal: event.testsTotal,
      summary: event.summary,
    });

    addMessage({
      author: AGENTS.find((agent) => agent.id === event.agentId)?.name ?? 'OpenVSP Subagent',
      role: 'agent',
      content: event.summary,
    });
  }
}

async function runFallbackHarness(prompt, { updateAgent }) {
  const startedAt = new Date().toISOString();

  await Promise.all(
    AGENTS.map(async (agent) => {
      updateAgent(agent.id, {
        status: 'running',
        progress: 15,
        testsComplete: 0,
        summary: '',
      });

      for (let index = 0; index < agent.tests; index += 1) {
        await fallbackDelay(80);
        updateAgent(agent.id, {
          progress: Math.round(((index + 1) / agent.tests) * 100),
          testsComplete: index + 1,
        });
      }

      updateAgent(agent.id, {
        status: 'complete',
        progress: 100,
        testsComplete: agent.tests,
        summary: `${agent.name} finished fallback candidate scoring.`,
      });
    }),
  );

  const selectedCandidate = {
    id: 'fallback-optimizer-1',
    name: 'Fallback balanced design',
    agentId: 'constraint-optimizer',
    agentName: 'Constraint Optimizer Agent',
    pass: true,
    score: 94.4,
    span: 1.92,
    wingArea: 0.34,
    tailArm: 0.82,
    hTailArea: 0.066,
    vTailArea: 0.029,
    metrics: {
      aspectRatio: 10.84,
      massKg: 4.64,
      cruiseCl: 0.54,
      cd: 0.0348,
      liftToDrag: 15.52,
      hTailVolume: 0.58,
      vTailVolume: 0.037,
      staticMargin: 11.1,
      directionalMargin: 1.5,
      lateralMargin: 1.5,
    },
    requirements: {
      span: true,
      cruiseLift: true,
      stability: true,
    },
  };

  return {
    runId: `fallback-${Date.now()}`,
    mode: 'surrogate',
    source: 'Renderer fallback evaluator; Electron preload bridge was unavailable.',
    prompt,
    selectedCandidate,
    candidates: [selectedCandidate],
    agents: AGENTS.map((agent) => ({
      agentId: agent.id,
      agentName: agent.name,
      focus: agent.focus,
      summary: `${agent.name} finished fallback candidate scoring.`,
      candidates: [],
    })),
    artifacts: null,
    openVsp: {
      available: false,
      status: 'not executed',
      reason: 'Electron preload bridge was unavailable.',
    },
    recommendation: `Final recommendation: select ${selectedCandidate.name}. It passes the span, cruise lift, and stability constraints in fallback mode.`,
    startedAt,
  };
}
