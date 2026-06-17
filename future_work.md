# Future Work

## Incomplete Assignment Items

The current project is a functional MVP, but several assignment requirements are still incomplete or only partially implemented:

- The app does not yet use a real LLM provider. The current agent workflow is deterministic and AI-style, but there is no OpenAI/Claude/local model integration for planning or reasoning.
- The Simulation Results section has metrics and a candidate table, but it does not yet include graphs for L/D comparison, stability margins, or design ranking.
- The app generates OpenVSP artifacts and attempts to create a `.vsp3` model, but it does not yet run VSPAERO or ingest parsed aerodynamic solver results.
- The current candidate evaluation is a surrogate conceptual-design model, not a validated aerodynamic simulation pipeline.
- There is no automated test coverage for the agent workflow, IPC bridge, chat history persistence, or report rendering.
- `npm run lint` is only a placeholder and does not perform real linting.
- `npm audit` previously reported dependency vulnerabilities that still need separate review.

## Production OpenVSP Execution

The app now runs the agent workflow in the Electron main process and attempts to execute the OpenVSP Python API. On machines without OpenVSP installed, it falls back to a deterministic aerodynamic surrogate and labels the report as `Surrogate`.

To ship full OpenVSP execution:

- Install OpenVSP with Python bindings on the target workstation.
- Ensure `python` can import either `openvsp` or `vsp`.
- Optionally set `OPENVSP_PYTHON` to the Python executable that has the OpenVSP bindings installed.
- Validate the generated `build_openvsp_model.py` script against the exact OpenVSP version used by the team.
- Add VSPAERO execution and parsed result ingestion after `.vsp3` geometry generation.

## Real LLM Agent Integration

The app currently behaves like an agent harness, but the planning and candidate search are hard-coded. To make this a real AI harness:

- Add a model provider layer for OpenAI, Anthropic, or a local model.
- Keep the deterministic aerodynamic evaluator as a tool the model can call.
- Let the main agent decide parameter search strategy and delegate bounded tasks to the five subagents.
- Persist the model reasoning trace in a structured format that the UI can render safely.
- Add cost, timeout, retry, and cancellation controls for model calls.

## Simulation Report Improvements

The report should become more visual and easier to inspect:

- Add L/D comparison chart.
- Add stability margin chart.
- Add design ranking chart.
- Show the tested parameter values in a denser table with pass/fail reasons.
- Separate surrogate results from real OpenVSP/VSPAERO results in the UI.

## Engineering Hardening

Before shipping to a startup team, the project needs:

- README-driven smoke-test steps verified on a clean machine.
- Real linting configuration.
- Unit tests for candidate scoring and report generation.
- Renderer tests for chat history and report rendering.
- IPC error handling and user-visible failure messages.
- Dependency vulnerability review.
- Packaging verification for the target operating system.

## Requirements to Reconsider

The requirement to use five parallel subagents is useful for UX and traceability, but it should not be treated as a fixed engineering limit. Real OpenVSP/VSPAERO studies should use a scheduler that limits concurrency based on CPU cores, available memory, and OpenVSP license/runtime stability.
