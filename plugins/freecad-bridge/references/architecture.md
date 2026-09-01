# Architecture

Codex calls one of six closed MCP tools. The bundled coordinator authenticates a source-owned FreeCAD GUI extension on an ephemeral loopback endpoint. Live inspection and transactions execute on FreeCAD's application thread through the documented Python API. Deterministic STEP/STL export uses the same installed application identity through a fixed `FreeCADCmd.exe` batch script. Every mutation is guarded by the independently observed document revision, an exact checkpoint, native recompute/save readback, and an immutable receipt. Bridge Runtime is absent at runtime.
