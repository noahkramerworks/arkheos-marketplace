---
schema_version: 1
design_id: plugin-1788207232622-0a182138
kind: plugin
name: obs-bridge
status: accepted
target_path: "C:\\Users\\rizek\\plugins\\obs-bridge"
accepted_at: 2026-08-31T20:13:52.621Z
authority_build: "codex-cli 0.149.0 / codex-runtime 0.1.8 / bridge-runtime 0.2.0"
source_digest: 6a89cd6a8feae94f15f0efa0a871fadb7f05d7d978408a8558c27cae7bc8fadf
marketplace: personal
interface_asset_profile: personal-png-v1
mcp_disposition: bundled-server
open_questions: []
---

# Intent and non-goals

OBS Bridge 0.2.0 recertifies the existing four-Skill, three-tool bridge against Bridge Runtime 0.2.0's machine-enforced `bridge-profile/v1.2` API-admission contract. The admitted boundary is OBS Studio 32.2.1's bundled obs-websocket 5.7.4 native protocol at RPC version 1. The bridge remains a narrow protocol-only adapter for typed scene/input inspection, verified creation, and receipt-bound rollback.

This release does not add a product workflow, UI automation, screen interpretation, controller scripting, raw RPC, command execution, unrestricted paths, output/stream/record control, credential persistence, cloud service, native binary, or generic automation surface. Stream Showrunner remains a separate product plugin that composes this bridge.

# Authoritative evidence and alternatives

The existing 0.1.2 source, accepted design, tests, live canary, installed OBS 32.2.1 executable, bundled obs-websocket module, observed `GetVersion` response, Bridge Runtime 0.2.0 contracts, and rollout session `01a05874-6b6f-7640-b77a-8e8db02a9096` are authoritative. Public product documentation is intentionally not used.

The retained protocol-only adapter is preferred over a compiled in-process extension because the bundled native protocol already exposes version negotiation, typed reads and writes, independent readback, and exact reversible effects. UI automation and generic request passthrough are rejected by the admission contract. No open design questions remain.

# Complete package tree

Retain `.codex-plugin/plugin.json`, `.mcp.json`, `.gitignore`, `AGENTS.md`, `agents/openai.yaml`, `assets/logo.png`, `assets/composer-icon.png`, `assets/source/logo.svg`, `audit/plugin-audit.json`, `bridge/profile.json`, `design/plugin.md`, `mcp/obs-client.mjs`, `mcp/operations.mjs`, `mcp/server.mjs`, `mcp/state.mjs`, `README.md`, `references/bridge-contract.md`, `references/obs-protocol.md`, `references/state-and-security.md`, `skills/index/SKILL.md`, `skills/inspect/SKILL.md`, `skills/apply/SKILL.md`, `skills/rollback/SKILL.md`, `tests/live-canary.mjs`, `tests/mock-obs.mjs`, `tests/package.test.mjs`, `tests/protocol.test.mjs`, and `tests/workflow.test.mjs`.

Add `LICENSE` with Apache-2.0 text and `tests/admission.test.mjs`. No scripts, templates, apps, extra Skills, extra tools, generated assets, packaged binaries, or remote-service declarations are added.

# Inputs, outputs, persistence, authority, and provenance

The `obs_bridge` MCP server continues to expose exactly `inspect`, `apply_scene_plan`, and `rollback_receipt`. Tool schemas remain closed. Inputs are limited to a loopback WebSocket endpoint, bounded names, one typed ensure-scene/ensure-input plan, and an exact receipt ID. No tool accepts arbitrary code, shell commands, raw protocol payloads, credentials, or filesystem paths.

OBS remains authoritative for native scene, input, version, capability, and video state. The bridge owns plan admission, bounded pre-state, immutable content-addressed receipts, independent native readback, exact restoration proof, and fail-closed recovery classification. Existing state under `C:\Users\rizek\.codex\state\plugins\obs-bridge\v1` and all earlier receipts remain valid and immutable.

Canonical source remains `C:\Users\rizek\plugins\obs-bridge` with required clean Git provenance. Existing v1.1 evidence and certificates remain immutable history and are stale for promotion until this exact 0.2.0 revision receives a current v1.2 certificate.

# API admission and release profile

`bridge/profile.json` becomes `bridge-profile/v1.2`. It identifies OBS Studio 32.2.1 and the bundled obs-websocket module as application artifacts, and binds the native module plus the source-owned protocol contract as control-surface artifacts. The surface is `native-protocol`, version `OBS Studio 32.2.1 / obs-websocket 5.7.4 / RPC 1`, exposed at a direct native loopback endpoint.

Typed reads are version, scene, input, and video-setting inspection. Typed writes are ensure-scene, ensure-input, and receipt rollback. The profile declares and tests independent readback, exact rollback, and negative flags for controller-only, UI automation, screen scraping, raw passthrough, and export-only behavior. `api-contract-admission` is the first of all six required certification tiers.

Release targets are `obs-bridge@personal` and `obs-bridge@arkheos`, both Apache-2.0, certificate-gated, and fresh-task-gated. Marketplace publication remains a separate Codex Runtime effect after Bridge Runtime reports both targets promotion-ready.

# Activation and verification

Update all version-bearing package, MCP, receipt, test, Skill/reference, design, and recovery text to 0.2.0 without changing the receipt schema. Add `npm run test:admission` for the profile, typed capability, independent readback, exact rollback, and forbidden-surface assertions. Keep `npm test` deterministic and `npm run test:live` as the native canary.

The live canary creates a uniquely named isolated scene and color input through typed WebSocket requests, observes both independently, rolls back by immutable receipt, and proves the complete bounded pre-state fingerprint equals the restored fingerprint. Its evidence must record OBS 32.2.1, obs-websocket 5.7.4, RPC 1, application and contract artifact hashes, read/write/rollback receipt identities, and clean source revision.

Run the Codex Runtime blocking plugin audit with explicit positive, negative, missing-context, and failure evidence. Then run Bridge Runtime assessment, all source-owned tests, the native canary, v1.2 certification, and promotion checks. Install/update through Codex Runtime, verify exact source/marketplace/cache identity, and prove a genuinely fresh task discovers four Skills and three tools and completes one harmless native inspection.

# Acceptance tests

- The profile is admitted only as the official version-bound native protocol and rejects every weak-surface flag or missing typed capability.
- Package, protocol-negative, isolated workflow, audit, and native canary tests pass at the exact clean 0.2.0 Git revision.
- Native write success is insufficient without separate scene/input readback, and rollback is insufficient without equality of the pre-state and restored-state fingerprints.
- The certificate binds application artifacts, control-surface artifacts, typed read/write probes, independent observation, exact restoration, audit evidence, and fresh-task evidence.
- Bridge Runtime reports promotion-ready for both `personal` and `arkheos`; neither marketplace is mutated before that gate passes.
- Existing receipts and historical v1.1 evidence/certificates are not edited.

# Intentional absences

No fifth Skill, fourth MCP tool, setup tool, export tool, raw request tool, embedded password, UI controller, screen scraper, packaged OBS binary, customer-product flow, analytics, new native dependency, or state purge is present. The existing deterministic PNG assets remain unchanged because the accepted personal interface profile already passes.
