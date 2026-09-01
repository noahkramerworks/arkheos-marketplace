# Architecture

Codex calls one of six closed MCP tools. The bundled coordinator authenticates a source-owned PyQGIS extension on an ephemeral loopback endpoint. Inspection, project transactions, layout rendering, save, reload, and readback execute through QGIS 4.2.0's documented application API. Every mutation is guarded by the independently observed project revision, an exact checkpoint, native save readback, and an immutable receipt. Bridge Runtime is absent at runtime.

