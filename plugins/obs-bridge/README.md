# OBS Bridge

Native, reversible OBS Studio control for Codex through obs-websocket 5.x.

The plugin contributes four focused Skills and one bundled stdio MCP server with three tools:

- `inspect` observes connection, version, capabilities, scenes, inputs, and video settings.
- `apply_scene_plan` creates missing scenes and inputs, verifies them, and automatically rolls back bridge-created resources on failure.
- `rollback_receipt` explicitly reverses resources created by one receipt.

OBS remains authoritative. Passwords enter only through `OBS_WEBSOCKET_PASSWORD`; they are never accepted in tool payloads or persisted. Durable receipts live under `$CODEX_HOME/state/plugins/obs-bridge/v1`.

This is a reusable bridge, not a vertical-stream or podcast product. Read `design/plugin.md` for the accepted package and lifecycle contract.
