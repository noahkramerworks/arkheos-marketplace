# OBS Bridge

Bridge Runtime-certified, reversible OBS Studio control for Codex through the native obs-websocket protocol.

Version 0.2.0 is bound to OBS Studio 32.2.1, bundled obs-websocket 5.7.4, and RPC 1. The release is Apache-2.0 and targets both `obs-bridge@personal` and `obs-bridge@arkheos`.

The plugin contributes four focused Skills and one bundled stdio MCP server with three tools:

- `inspect` observes connection, version, capabilities, scenes, inputs, and video settings.
- `apply_scene_plan` creates missing scenes and inputs, verifies them, and automatically rolls back bridge-created resources on failure.
- `rollback_receipt` explicitly reverses resources created by one receipt.

OBS remains authoritative. Passwords enter only through `OBS_WEBSOCKET_PASSWORD`; they are never accepted in tool payloads or persisted. Durable receipts live under `$CODEX_HOME/state/plugins/obs-bridge/v1`.

The API-admission gate rejects controller-only access, UI automation, screen scraping, raw request passthrough, export-only behavior, and command-success claims without native state verification. This is a reusable bridge, not a vertical-stream or podcast product. Read `design/plugin.md` for the accepted package and lifecycle contract.
