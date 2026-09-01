# Architecture

The bundled MCP server owns an ephemeral HTTP coordinator on `127.0.0.1`, a 256-bit bearer token, queues, checkpoints, receipts, and owned process records. The native `reaper_codex_bridge.dll` is loaded by REAPER and polls the coordinator from REAPER's registered timer callback. Jobs execute on REAPER's main thread. The extension has no listener and accepts no inbound connection. Connection admission binds REAPER 7.79, bridge extension 0.2.0, API ABI `0x20E`, pinned SDK commit `490ded57668727fba21482fabc50ba9853a457bb`, protocol `reaper-bridge/1`, loopback endpoint, and bearer token.

Runtime discovery lives in `%CODEX_HOME%\state\plugins\reaper-bridge\v1\runtime\current.json`. It contains only loopback endpoint, token, PID, protocol, and expiry and is removed when the server exits.

Read `reaper-api-contract.md` for the exact official API boundary, selected functions, typed capabilities, and rejected surfaces.
