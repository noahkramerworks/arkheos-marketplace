# Blender Bridge operating contract

This is canonical source for `blender-bridge@personal` and `blender-bridge@arkheos`. Read [the accepted design](design/plugin.md), [the bridge profile](bridge/profile.json), manifests, all seven Skills and references, schemas, MCP modules, extension, and tests before material changes.

Blender is authoritative for scene, dependency graph, render, viewport, and export state. The bridge owns enrollment, exact executable identity, admitted schemas, revisions, checkpoints, receipts, owned processes/jobs, and rollback. Never add arbitrary Python, raw operators, arbitrary RNA, free-form drivers, UI automation, unrestricted filesystem access, or unbounded payloads.

Admission is a hard gate: the exact Blender 5.2.1 LTS executable must expose the documented Python API with typed reads and writes, independent saved-file and process readback, and exact rollback. Reject controller-only, UI automation, screen scraping, raw passthrough, export-only, and command-success-only substitutes.

Build with Node 24 and the profile-bound Blender 5.2.1 LTS executable. Run `npm test`, `npm run test:admission`, Blender extension validate/build, the live native canary, Codex Runtime 0.1.8 blocking audit, Bridge Runtime 0.2.0 evidence-backed certification/promotion, both marketplace installs, and genuinely fresh task discovery of seven Skills and sixteen tools. Preserve foreign extension state, enrollment, receipts, recovery markers, and immutable certificate history. Recovery begins with exact source, Git, evidence, certificate, native identity, marketplace, cache, enabled-state, and fresh task inspection.
