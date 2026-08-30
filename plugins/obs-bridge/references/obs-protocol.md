# OBS protocol boundary

The transport is obs-websocket 5.x JSON over WebSocket, defaulting to `ws://127.0.0.1:4455`.

- Server Hello is opcode 0.
- Client Identify is opcode 1 with RPC version 1 and authentication when required.
- Server Identified is opcode 2.
- Requests and responses are opcodes 6 and 7 and correlate by `requestId`.
- `GetVersion.availableRequests` is authoritative for callable request availability.

Authentication follows the 5.x contract: `secret = base64(SHA256(password + salt))`, then `authentication = base64(SHA256(secret + challenge))`. The password is supplied only by `OBS_WEBSOCKET_PASSWORD`.

The v0.1.0 operation set uses `GetVersion`, `GetSceneList`, `GetInputList`, `GetInputKindList`, `GetVideoSettings`, `GetSceneItemList`, `CreateScene`, `CreateInput`, `RemoveInput`, and `RemoveScene`. Mutating calls are unavailable unless every required request is advertised.
