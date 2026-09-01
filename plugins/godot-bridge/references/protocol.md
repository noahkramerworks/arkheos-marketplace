# Protocol

Protocol `godot-bridge/ipc/v1` uses authenticated JSON over loopback HTTP. Runtime discovery contains endpoint, bearer token, server process identity, protocol version, and expiry. Requests bind request ID, project ID, canonical project root, operation, deadline, and input.

The addon registers, polls `/v1/jobs/next`, and posts one terminal completion. Unknown keys, wrong roots, wrong project IDs, expired deadlines, oversized bodies, invalid authentication, duplicate completions, and unsupported operations fail closed. Secrets are never returned through MCP or persisted in receipts.

`capture_viewport` uses Godot's active `EditorDebuggerSession`, sends the engine-owned `scene:rq_screenshot` request, and correlates the resulting `game_view:get_screenshot` response by request ID. The addon accepts only a bounded `scr-*.png` beneath Godot's exact temporary directory, reads and hashes it, deletes the temporary file, and returns `source: "game-debugger"` with the native game viewport dimensions and PNG bytes. Editor-window texture capture is not an admitted fallback.

`inspect_export` and `build_export` do not add IPC operations. They run inside the MCP server against explicit project, enrollment, preset, template, revision, and external-output identities. No export command or arbitrary argument crosses the addon protocol.
