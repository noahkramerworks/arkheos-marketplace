---
schema_version: 1
design_id: plugin-1788214179119-3471af98
kind: plugin
name: freecad-bridge
status: accepted
target_path: "C:\\Users\\rizek\\plugins\\freecad-bridge"
accepted_at: 2026-08-31T22:09:39.119Z
authority_build: "codex-cli 0.149.0 / codex-runtime 0.1.8 / bridge-runtime 0.2.0"
source_digest: null
marketplace: personal
interface_asset_profile: personal-png-v1
mcp_disposition: bundled-server
open_questions: []
---

# Intent and non-goals

Build `freecad-bridge` 0.1.0 as the source-owned, free application boundary between Codex and FreeCAD 1.1.3. The primary operator is Codex. It exposes exactly six closed tools for status, setup, bounded document inspection, revision-guarded parametric transactions, deterministic STEP/STL export, and receipt rollback, with seven focused Skills. Its official documented Python/library API is exposed by a bridge-owned live GUI extension and a separately constrained `FreeCADCmd.exe` batch exporter, both bound to the same exact application identity. Non-goals are arbitrary Python/macros, command passthrough, workbench/plugin installation, unrestricted properties or paths, UI automation, screen scraping, controller emulation, mesh scripting, remote execution, or support for versions other than 1.1.3.

The one defensible adapter is `hybrid-extension-batch`. Typed reads are application/build identity, active document path/digest, transaction revision, dirty state, object inventory, selected parametric properties, shape type, volume, and bounding box. Typed writes are create a bridge-owned Part box or cylinder, change admitted dimensional properties on bridge-owned features, rename a bridge-owned feature, and remove a bridge-owned feature. Independent readback re-queries the document after recompute/save and hashes the `.FCStd`. Exact rollback restores a sealed pre-state file checkpoint and reloads/re-reads it. Export accepts only an enrolled clean saved document at the expected revision and fixed STEP/STL formats through the source-owned batch contract.

# Complete package tree

- `.codex-plugin/plugin.json`, `.mcp.json`, `agents/openai.yaml`, `AGENTS.md`, `README.md`, `LICENSE`: package identity, bundled server, operating entrypoint, Apache-2.0 terms, and bridge contract.
- `assets/source/logo.svg`, `assets/logo.png`, `assets/composer-icon.png`: personal-png-v1 source and deterministic outputs.
- `design/plugin.md`, `bridge/profile.json`: accepted complete package design and bridge-profile/v1.2.
- `references/architecture.md`, `references/actions.md`, `references/security-and-state.md`, `references/recovery.md`, `references/freecad-api-contract.md`, `references/installer-provenance.md`: exact API, state, security, recovery, and vendor evidence.
- `skills/index/SKILL.md`, `skills/setup/SKILL.md`, `skills/inspect/SKILL.md`, `skills/edit/SKILL.md`, `skills/export/SKILL.md`, `skills/rollback/SKILL.md`, `skills/recover/SKILL.md`: seven focused workflows over six tools.
- `schemas/transaction.schema.json`, `schemas/receipt.schema.json`: closed parametric action and receipt contracts.
- `mcp/server.mjs`, `mcp/operations.mjs`, `mcp/coordinator.mjs`, `mcp/state.mjs`: framing, six tools, authenticated loopback coordination, bounded paths, checkpoints, and receipts.
- `freecad-adapter/TEMPLATE-PROVENANCE.json`, `freecad-adapter/adapter/README.md`, `freecad-adapter/adapter/extension.py`, `freecad-adapter/adapter/batch.mjs`, `freecad-adapter/adapter/batch.py`, `freecad-adapter/adapter/Init.py`, `freecad-adapter/adapter/InitGui.py`: hybrid template provenance, live extension, and closed batch implementation.
- `scripts/live-canary.mjs`: isolated GUI/batch canary orchestration.
- `fixtures/fixture.FCStd`: deterministic source-owned FreeCAD document.
- `tests/package.test.mjs`, `tests/admission.test.mjs`, `tests/protocol.test.mjs`, `tests/workflow.test.mjs`, `tests/live-native.test.mjs`: package, negative, coordinator, receipt, and native tests.
- `audit/plugin-audit.json`, `audit/evidence.json`: generated current hardened audit.

# Inputs, outputs, persistence, authority, and provenance

All inputs are closed JSON. Enrolled document roots and bridge-owned export roots are the only path authorities. Transactions contain 1..32 actions from `create_box`, `create_cylinder`, `set_dimension`, `rename_owned_feature`, and `remove_owned_feature`, with explicit allowed property names and numeric bounds. No input accepts code, macro text, commands, generic properties, raw protocol, credentials, or arbitrary paths. Export format is exactly `step` or `stl`. Outputs are bounded structured observations, immutable receipt IDs, hashes, and verified artifacts.

Canonical source is `C:\Users\rizek\plugins\freecad-bridge`; durable state is `C:\Users\rizek\.codex\state\plugins\freecad-bridge\v1`. The signed FreeCAD installation, user Mod directory/preferences, open documents, source, marketplace checkout, cache, state, and Bridge Runtime evidence are separate. Setup installs only hash-matching bridge-owned extension files and records exact ownership. Transactions checkpoint exact document bytes before mutation. Batch export never changes the source document and writes only to an admitted bridge-owned destination.

Application provenance binds the official signed FreeCAD 1.1.3 installer SHA-256, installed `FreeCAD.exe` and `FreeCADCmd.exe` digests, `FreeCAD 1.1.3 Revision 20260725`, and `App.Version()` build tuple/commit. Contract provenance binds the documented FreeCAD Python/library API reference and exact source-owned action mapping. Certification binds clean Git/source/design/template/audit/application/API digests, native write/readback/rollback evidence, export hashes, and fresh-task catalog evidence.

# Activation and verification

After acceptance, copy Bridge Runtime's exact hybrid-extension-batch template into the absent `freecad-adapter` root, retain provenance, implement both fixed adapters, render assets, test/audit, and commit clean source. Setup verifies app identity, installs the live extension without replacing foreign files, and records a reversible receipt. The extension polls a token-authenticated ephemeral loopback endpoint on the GUI thread. The batch adapter may spawn only the profile-bound `FreeCADCmd.exe` with the fixed source-owned `batch.py` and a closed bridge-authored job document.

The isolated canary copies the fixture, opens it in an owned FreeCAD GUI process, reads initial state, changes one parametric feature, recomputes and saves, independently re-reads native feature/volume/bounding-box and file digest, exports STEP and STL with the deterministic batch adapter, rolls back by receipt, reloads, and proves exact saved bytes. It closes only its owned clean process. Bridge Runtime certification/promotion targets `freecad-bridge@personal` and `freecad-bridge@arkheos`; fresh-task verification proves seven Skills, six tools, and harmless native inspection.

# Acceptance tests

- Admission binds FreeCAD 1.1.3's official documented API with non-empty typed reads/writes, independent readback, exact rollback, and no weak-surface flags.
- Negative tests reject arbitrary code/macros/commands/generic properties/raw payloads, path escape, wrong formats, stale revisions, dirty files, foreign features/receipts, and application drift.
- Package tests prove Apache-2.0 identity, seven Skills, six tools, exact adapter provenance, complete references/assets, and accepted design.
- Fixture tests prove revision gates, content-addressed receipts, independent recompute observation, and byte-exact restoration.
- Native canary proves a real parametric change plus STEP/STL exports through FreeCAD 1.1.3 and exact restoration.
- Hardened schema-v2 audit passes with zero findings on a clean exact commit.
- Immutable v1.2 evidence/certificate bind installer, application/API identity, read/write/readback/rollback/export evidence, and fresh catalog digest; promotion refuses drift.
- Both marketplace targets install with exact source/public/cache identity, correct Apache license, seven Skills, six tools, and one harmless inspection.

# Intentional absences

No app connector, remote MCP, hosted service, analytics, telemetry, UI automation, browser, macro runner, Python console, command passthrough, workbench manager, generic property editor, arbitrary import/export, or separate product repository is included. No application binary, installer, certificate, or mutable runtime evidence is committed. Only bridge-owned features are mutable.
