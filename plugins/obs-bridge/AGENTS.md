# OBS Bridge operating contract

This is canonical source for `obs-bridge@personal` and `obs-bridge@arkheos`. Read [the accepted design](design/plugin.md), [the bridge profile](bridge/profile.json), manifests, all four Skills and linked references, MCP modules, and tests before material changes.

OBS Studio 32.2.1 and its bundled obs-websocket 5.7.4 / RPC 1 endpoint remain authoritative. The bridge owns typed API admission, bounded pre-state, immutable receipts, independent effect readback, and receipt rollback. Preserve existing receipts and immutable v1.1 evidence/certificates; they are stale for promotion, not mutable history.

Never add controller-only access, raw request passthrough, arbitrary code or commands, unrestricted paths, UI automation, screen scraping, export-only behavior, product workflows, or credential persistence. A command exit is never native-effect proof.

Run `npm test`, `npm run test:admission`, interface asset checks, the Codex Runtime 0.1.8 blocking audit, all six Bridge Runtime 0.2.0 evidence-backed certification tiers, and both-target promotion gate. Then verify exact source, personal and ArkheOS marketplace entries, cache, enabled configuration, and genuinely fresh task discovery of four Skills and three tools plus one harmless native inspection.

Recovery begins with exact source, Git status, accepted design, profile, current v1.2 evidence/certificate, native artifact identity, marketplace entries, cache, enabled state, and fresh-task discovery. Never treat a mock, package test, successful request, cache presence, or existing task as proof of the requested native or activation effect.
