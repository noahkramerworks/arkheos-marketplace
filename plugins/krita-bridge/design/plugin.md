---
schema_version: 1
design_id: plugin-1788214179403-8e278565
kind: plugin
name: krita-bridge
status: accepted
target_path: "C:\\Users\\rizek\\plugins\\krita-bridge"
accepted_at: 2026-08-31T22:09:39.403Z
authority_build: "codex-cli 0.149.0 / codex-runtime 0.1.8 / bridge-runtime 0.2.0"
source_digest: null
marketplace: personal
interface_asset_profile: personal-png-v1
mcp_disposition: bundled-server
open_questions: []
---

# Intent and non-goals

Build `krita-bridge` 0.1.0 as the source-owned, free application boundary between Codex and Krita 5.3.3. The primary operator is Codex. It contributes seven focused Skills and exactly six closed tools for status, setup, bounded document inspection, revision-guarded layer transactions, PNG export, and receipt rollback. Its admitted surface is the documented PyKrita 5.3.3 API exposed through a bridge-owned authenticated reverse-polling extension on Krita's application thread. Non-goals are arbitrary Python, action-name passthrough, filter/script execution, unrestricted SVG/text/import payloads, raw RPC, filesystem browsing, UI automation, screen scraping, controller emulation, brush-event automation, remote services, or support for another Krita version.

The one defensible adapter is `reverse-polling-extension`. Typed reads are application/API identity, active document path/digest, dimensions, color model/depth/profile, dirty state, revision, and bounded layer tree. Typed writes are create a bridge-owned paint layer, rename a bridge-owned layer, set opacity, set visibility, and translate a bridge-owned layer by bounded integer offsets. Independent readback re-queries the document/layer tree in a separate poll and verifies the saved `.kra` digest. Exact rollback restores the sealed pre-document checkpoint, reloads, and independently reads the original layer tree and bytes. Export is a closed PNG operation to the bridge-owned export root after a clean expected-revision read.

# Complete package tree

- `.codex-plugin/plugin.json`, `.mcp.json`, `agents/openai.yaml`, `AGENTS.md`, `README.md`, `LICENSE`: identity, bundled server, operating entrypoint, GPL-3.0-or-later terms, and public bridge contract.
- `assets/source/logo.svg`, `assets/logo.png`, `assets/composer-icon.png`: personal-png-v1 source and deterministic renders.
- `design/plugin.md`, `bridge/profile.json`: accepted complete package design and bridge-profile/v1.2.
- `references/architecture.md`, `references/actions.md`, `references/security-and-state.md`, `references/recovery.md`, `references/krita-api-contract.md`, `references/installer-provenance.md`: exact API/security/state/recovery and vendor evidence.
- `skills/index/SKILL.md`, `skills/setup/SKILL.md`, `skills/inspect/SKILL.md`, `skills/edit/SKILL.md`, `skills/export/SKILL.md`, `skills/rollback/SKILL.md`, `skills/recover/SKILL.md`: seven focused workflows using only six tools.
- `schemas/transaction.schema.json`, `schemas/receipt.schema.json`: closed layer actions and immutable receipts.
- `mcp/server.mjs`, `mcp/operations.mjs`, `mcp/coordinator.mjs`, `mcp/state.mjs`: MCP framing, tool catalog, authenticated queue, bounded paths, ownership, checkpoints, and receipts.
- `krita-extension/TEMPLATE-PROVENANCE.json`, `krita-extension/adapter/README.md`, `krita-extension/adapter/extension.py`, `krita-extension/adapter/krita_bridge.desktop`, `krita-extension/adapter/__init__.py`: copied reverse-polling provenance and complete PyKrita extension.
- `scripts/live-canary.mjs`: isolated configuration/document canary orchestration.
- `fixtures/fixture.kra`: deterministic source-owned Krita document.
- `tests/package.test.mjs`, `tests/admission.test.mjs`, `tests/protocol.test.mjs`, `tests/workflow.test.mjs`, `tests/live-native.test.mjs`: package, negative, loopback, receipt, and real Krita verification.
- `audit/plugin-audit.json`, `audit/evidence.json`: generated hardened audit artifacts.

# Inputs, outputs, persistence, authority, and provenance

Tool inputs are closed JSON objects. Paths must be canonical and remain under an enrolled document root or bridge-owned export/state root. Actions are a bounded union for `create_paint_layer`, `rename_owned_layer`, `set_opacity`, `set_visibility`, and `translate_owned_layer`; names, opacity, offsets, and action counts are bounded. No tool accepts code, scripts, action IDs, filter names, raw pixel buffers, protocol payloads, credentials, tokens, or arbitrary paths. Outputs are bounded observations, content-addressed receipts, hashes, and PNG artifacts.

Canonical source is `C:\Users\rizek\plugins\krita-bridge`; state is `C:\Users\rizek\.codex\state\plugins\krita-bridge\v1`. The signed Krita install, PyKrita user plugin/config, user documents, source, state, marketplace checkout, cache, and Bridge Runtime evidence are distinct. Setup copies only exact source-owned extension files into a dedicated bridge-owned configuration or the owned PyKrita directory and records their hashes and prior enablement state. Transactions checkpoint exact `.kra` bytes before mutation and only mutate layers marked with bridge-owned names/metadata.

Application provenance binds the official signed `krita-x64-5.3.3-setup.exe` SHA-256, `krita.exe` 5.3.3 git 858d352 digest, and live `Krita.instance().version()` observation. Contract provenance binds installed PyKrita API availability and the exact source-owned API mapping. Certification binds clean Git/source/design/template/audit/application/API digests, live write/readback/rollback/export evidence, and fresh-task catalog evidence.

# Activation and verification

After design acceptance, copy Bridge Runtime's exact reverse-polling template into the absent `krita-extension` root, retain provenance, implement the PyKrita extension, render assets, run tests/audit, and commit clean source. Setup verifies exact Krita identity, installs/enables only bridge-owned files with a reversible receipt, and never reads unrelated resources. The extension polls an ephemeral token-authenticated localhost endpoint and exposes no general action or eval surface.

The isolated canary opens a copied fixture in an owned Krita 5.3.3 process, reads initial state, creates and translates one bridge-owned paint layer, saves, independently re-reads the layer transform/tree and `.kra` digest, exports PNG, rolls back by receipt, reloads, and proves exact bytes and original layer tree. It closes only its owned clean process. Certification/promotion target `krita-bridge@personal` and `krita-bridge@arkheos`; fresh-task verification proves exactly seven Skills, six tools, and one harmless native inspection.

# Acceptance tests

- Admission binds Krita 5.3.3 PyKrita with typed reads/writes, independent readback, exact rollback, and all weak flags false.
- Protocol/tool negatives reject unauthenticated polling, arbitrary code/scripts/action IDs/filters/raw payloads, traversal, foreign layers, dirty/stale documents, extra fields, and version drift.
- Package validation proves GPL-3.0-or-later, seven Skills, six tools, complete assets/references, accepted design, and template provenance.
- Fixture tests prove closed action validation, receipt ownership, independent layer-tree readback, and byte-exact restoration.
- Native canary proves create/transform/export through real PyKrita 5.3.3 and exact restoration.
- Hardened schema-v2 audit passes with zero findings on a clean commit.
- Immutable v1.2 evidence/certificate bind installer/executable/API, read/write/readback/rollback/export evidence, and fresh catalog digest; promotion refuses drift.
- Both marketplace targets prove exact source/public/cache identity, selector/license correctness, seven Skills, six tools, and harmless inspection.

# Intentional absences

No app connector, remote MCP, hosted service, analytics, telemetry, UI automation, browser, generic Python runner, Krita action passthrough, filter engine, arbitrary image import, unrestricted file tool, or separate product repository is included. No application binary, installer, certificate, or mutable evidence is committed. The bridge does not claim ownership over or mutate foreign layers.
