---
name: inspect
description: Inspect OBS Studio through the native OBS Bridge connection, including negotiated versions, available requests, scenes, inputs, video settings, and connection failures. Use for diagnosis and preflight, not mutation.
---

# Inspect OBS

Read [OBS protocol](../../references/obs-protocol.md) and [state and security](../../references/state-and-security.md).

Call the bundled `obs_bridge.inspect` MCP tool. Supply `endpoint` only when the user selected a non-default loopback address. Never request or place a password in tool input; authentication comes from `OBS_WEBSOCKET_PASSWORD`.

Report OBS Studio version, obs-websocket version, RPC version, required-request availability, bounded scenes and inputs, and video settings. This release is admitted only for OBS Studio 32.2.1 with obs-websocket 5.7.4 / RPC 1; version drift blocks certification and should be reported explicitly. Treat missing OBS, closed WebSocket, authentication failure, timeout, or missing request support as observed boundaries. Do not start OBS or change configuration unless the user also requested setup or operation.

The inspection tool is strictly read-only: it may read OBS through typed protocol requests but must not create or update enrollment, receipt, project, or application state.
