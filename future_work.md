# Future Work

## Production OpenVSP Execution

The app now runs the agent workflow in the Electron main process and attempts to execute the OpenVSP Python API. On machines without OpenVSP installed, it falls back to a deterministic aerodynamic surrogate and labels the report as `Surrogate`.

To ship full OpenVSP execution:

- Install OpenVSP with Python bindings on the target workstation.
- Ensure `python` can import either `openvsp` or `vsp`.
- Optionally set `OPENVSP_PYTHON` to the Python executable that has the OpenVSP bindings installed.
- Validate the generated `build_openvsp_model.py` script against the exact OpenVSP version used by the team.
- Add VSPAERO execution and parsed result ingestion after `.vsp3` geometry generation.

## Requirements to Reconsider

The requirement to use five parallel subagents is useful for UX and traceability, but it should not be treated as a fixed engineering limit. Real OpenVSP/VSPAERO studies should use a scheduler that limits concurrency based on CPU cores, available memory, and OpenVSP license/runtime stability.
