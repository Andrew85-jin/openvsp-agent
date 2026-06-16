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
    duration: 2400,
    tests: 8,
    summary: 'Best candidate uses 1.92 m span, 0.34 m2 wing area, AR 10.8, and moderate taper.',
  },
  {
    id: 'cruise-efficiency',
    name: 'Cruise Efficiency Agent',
    focus: 'Cruise CL, induced drag, parasite drag, L/D',
    duration: 3100,
    tests: 10,
    summary: 'Highest scoring set reached estimated L/D 17.6 at 22 m/s with CL near 0.72.',
  },
  {
    id: 'tail-sizing',
    name: 'Tail Sizing Agent',
    focus: 'Horizontal tail, vertical tail, tail arm',
    duration: 2800,
    tests: 9,
    summary: 'Stable tail sizing requires Vh 0.57 and Vv 0.045 with a 0.82 m tail arm.',
  },
  {
    id: 'stability',
    name: 'Stability Agent',
    focus: 'Longitudinal, lateral, directional stability',
    duration: 3400,
    tests: 7,
    summary: 'Rejected two high-L/D candidates because static margin and directional margin were too low.',
  },
  {
    id: 'constraint-optimizer',
    name: 'Constraint Optimizer Agent',
    focus: 'Requirements pass/fail and final ranking',
    duration: 3800,
    tests: 6,
    summary: 'Selected the balanced design because it passes span, stability, and payload constraints.',
  },
];

const FINAL_RESPONSE = `Final recommendation: use a 1.92 m span fixed-wing configuration with a high-aspect-ratio wing, conservative tail volume, and cruise trim around 22 m/s.

The selected design is better than the alternatives because it keeps the wingspan under 2 m, preserves stability margins, and gives the best estimated L/D among the candidates that passed all requirements.`;

const delay = (ms) => new Promise((resolve) => {
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
  addMessage({
    author: 'OpenVSP Agent',
    role: 'assistant',
    content: 'Mission received. I will decompose the design search into five parallel specialist agents.',
  });

  await delay(600);

  addMessage({
    author: 'OpenVSP Agent',
    role: 'assistant',
    content: 'Parameter sweep plan: wing planform, cruise efficiency, tail sizing, stability margins, and final constraint ranking.',
  });

  await delay(500);

  await Promise.all(AGENTS.map((agent) => runSubagent(agent, prompt, { addMessage, updateAgent })));

  addMessage({
    author: 'OpenVSP Agent',
    role: 'assistant',
    content: FINAL_RESPONSE,
  });
}

async function runSubagent(agent, prompt, { addMessage, updateAgent }) {
  updateAgent(agent.id, {
    status: 'running',
    progress: 8,
    summary: '',
  });

  addMessage({
    author: agent.name,
    role: 'agent',
    content: `Started. Focus area: ${agent.focus}.`,
  });

  const checkpoints = [28, 52, 76, 100];
  const stepDelay = agent.duration / checkpoints.length;

  for (let index = 0; index < checkpoints.length; index += 1) {
    await delay(stepDelay);

    const progress = checkpoints[index];
    const testsComplete = Math.max(1, Math.round((agent.tests * progress) / 100));

    updateAgent(agent.id, {
      progress,
      testsComplete,
    });
  }

  updateAgent(agent.id, {
    status: 'complete',
    progress: 100,
    testsComplete: agent.tests,
    summary: agent.summary,
  });

  addMessage({
    author: agent.name,
    role: 'agent',
    content: `${agent.summary} Tested ${agent.tests} candidate configurations.`,
  });
}
