# OpenVSP Agent Harness

Electron desktop prototype for an AI-style OpenVSP agent harness. The app coordinates a fixed-wing surveillance drone design study, shows the intermediate work of five specialist subagents, and presents a separate simulation report with candidate comparisons and the final selected design.

## Current Functionality

- Electron Forge + Vite + React app using plain JSX and CSS.
- Chat workspace for running the mission prompt or entering a custom prompt.
- Five parallel specialist subagents:
  - Wing Planform Agent
  - Cruise Efficiency Agent
  - Tail Sizing Agent
  - Stability Agent
  - Constraint Optimizer Agent
- Traceable progress cards for each subagent, including simulation counts and completion state.
- Simulation results panel separate from the chat, showing:
  - selected design;
  - L/D, span, wing area, and static margin;
  - pass/fail checks for span, cruise lift, and stability;
  - top candidate comparison table;
  - OpenVSP execution status and generated artifact path.
- Chat history stored in `localStorage`, with support for creating, switching, and deleting chats.
- Electron main-process OpenVSP bridge that attempts to use the OpenVSP Python API.
- Deterministic surrogate aerodynamic analysis when OpenVSP Python bindings are unavailable.

## Requirements

- Node.js and npm.
- Optional for real OpenVSP model generation:
  - OpenVSP installed locally.
  - Python environment that can import `openvsp` or `vsp`.
  - `OPENVSP_PYTHON` set to the Python executable with OpenVSP bindings, if the default `python` command does not work.

The app can still run without OpenVSP installed. In that case it uses surrogate aerodynamic calculations and labels the report as `Surrogate`.

## Install

```bash
npm install
```

## Run In Development

```bash
npm start
```

This starts the Electron Forge development workflow and opens the desktop app.

## Package

```bash
npm run package
```

## How To Use

1. Start the app.
2. Click `Run mission prompt` to execute the built-in drone design assignment.
3. Watch the five subagents update their progress in parallel.
4. Review intermediate actions in the chat.
5. Review the selected aircraft and candidate comparison in the `Simulation Results` panel.

## OpenVSP Runtime Notes

The main process writes run artifacts under Electron's user data directory in an `openvsp-runs` folder. Each run can include:

- `design_candidates.json`
- `build_openvsp_model.py`
- `selected_design.vsp3`, when OpenVSP execution succeeds
- `report.json`

If OpenVSP is not available, the app still produces a report using the internal surrogate evaluator.

## Project Structure

```text
src/
  main/
    main.js
    openvspAgent.js
  preload/
    preload.js
  renderer/
    App.jsx
    index.jsx
    components/Chat/
    hooks/
    services/
    styles/
```

## Known Limitations

See `future_work.md` for the remaining work required before this can be treated as a production OpenVSP/VSPAERO workflow.
