# Architecture

```text
Codex Skill -> godot_bridge MCP -> loopback coordinator -> project-local EditorPlugin -> Godot
                         `-> revision-bound export process -> external verified artifact
```

The MCP server owns schemas, lifecycle, serialization, checkpoints, receipts, export staging, and artifact verification. The addon reverse-polls and executes admitted editor work on Godot's editor thread. Export remains a closed server-side Godot process and never becomes an addon RPC. Godot owns actual editor, runtime, preset, and exporter state. Product plugins compose this bridge; the bridge contains no game design or packaging policy.

The server is inert until called. Each project has an exact enrollment and connection identity. Multiple projects may connect, but each has one mutation queue. Read operations remain bounded and may proceed independently.
