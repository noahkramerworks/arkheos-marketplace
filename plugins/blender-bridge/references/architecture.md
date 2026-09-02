# Architecture

`Skill -> blender_bridge stdio MCP -> authenticated ephemeral-loopback coordinator -> reverse-polling Blender extension -> bpy main thread`. Owned background Blender processes perform deterministic fallback capture, render, and export work. The exact Blender 5.2.1 executable hash binds both paths and the documented Python API contract. See [API admission](api-admission.md).

The extension performs native state inspection and admitted scene actions, including one bounded pose-action writer. The coordinator owns strict discriminated validation, enrollment, serialization, checkpoints, receipts, job identity, bounded logs, and external artifact staging. Product plugins may compose this bridge but may not widen its authority.
