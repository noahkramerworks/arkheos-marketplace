---
schema_version: 1
design_id: plugin-1788214178864-3448d33c
kind: plugin
name: qgis-bridge
status: accepted
target_path: "C:\\Users\\rizek\\plugins\\qgis-bridge"
accepted_at: 2026-08-31T22:09:38.863Z
authority_build: "codex-cli 0.149.0 / codex-runtime 0.1.8 / bridge-runtime 0.2.0"
source_digest: null
marketplace: personal
interface_asset_profile: personal-png-v1
mcp_disposition: bundled-server
open_questions: []
---

# Intent and non-goals

QGIS Bridge 0.1.1 preserves the accepted source-owned 0.1.0 application boundary between Codex and QGIS 4.2.0 and repairs only its public license package: the invalid stub is replaced by the complete GNU GPL version 3 terms and package validation now rejects incomplete license text. The primary operator is Codex. The bridge contributes exactly seven focused Skills and six closed semantic tools for status, setup, bounded project inspection, revision-guarded layer transactions, deterministic layout export, and receipt rollback. Its one admitted control surface is the documented QGIS 4.2.0 PyQGIS API exposed through a bridge-owned authenticated reverse-polling extension on the QGIS main thread. Non-goals are arbitrary Python, processing-expression passthrough, SQL passthrough, provider credentials, raw RPC, shell execution, unrestricted paths, UI automation, screen scraping, controller emulation, remote services, or support for a different QGIS version.

The one defensible adapter is `reverse-polling-extension`. Typed reads are application/API identity, active project path/digest, dirty state, layer inventory, renderer summary, layout inventory, CRS, and revision. Typed writes are add a bridge-owned GeoJSON layer, set a closed single-symbol color/width, rename a bridge-owned layer, create/update one bridge-owned print layout, and remove a bridge-owned layer. Independent readback re-queries `QgsProject`, its layer tree and renderer through a separate poll response and verifies the saved `.qgz` digest. Exact rollback restores a sealed pre-project checkpoint, removes only bridge-owned generated files, reloads, and re-reads the native state.

# Complete package tree

- `.codex-plugin/plugin.json`, `.mcp.json`, `agents/openai.yaml`, `AGENTS.md`, `README.md`, `LICENSE`: plugin identity, one bundled stdio server, operating entrypoint, GPL-3.0-or-later terms, and user contract.
- `assets/source/logo.svg`, `assets/logo.png`, `assets/composer-icon.png`: personal-png-v1 source and deterministic renders.
- `design/plugin.md`, `bridge/profile.json`: accepted complete design and bridge-profile/v1.2.
- `references/architecture.md`, `references/actions.md`, `references/security-and-state.md`, `references/recovery.md`, `references/qgis-api-contract.md`, `references/installer-provenance.md`: shared contracts and pinned QGIS evidence.
- `skills/index/SKILL.md`, `skills/setup/SKILL.md`, `skills/inspect/SKILL.md`, `skills/edit/SKILL.md`, `skills/export/SKILL.md`, `skills/rollback/SKILL.md`, `skills/recover/SKILL.md`: seven focused workflows using only the six semantic tools.
- `schemas/transaction.schema.json`, `schemas/receipt.schema.json`: closed actions and immutable receipts.
- `mcp/server.mjs`, `mcp/operations.mjs`, `mcp/coordinator.mjs`, `mcp/state.mjs`: MCP framing, tool catalog, authenticated loopback queue, enrollment, receipts, checkpoints, and strict path/identity validation.
- `qgis-extension/TEMPLATE-PROVENANCE.json`, `qgis-extension/adapter/README.md`, `qgis-extension/adapter/extension.py`, `qgis-extension/adapter/metadata.txt`, `qgis-extension/adapter/__init__.py`: copied reverse-polling template provenance and the bridge-owned PyQGIS extension.
- `scripts/live-canary.mjs`: isolated profile/project launch and canary orchestration.
- `fixtures/layer.geojson`, `fixtures/project.qgs`: deterministic source-owned native fixture inputs.
- `tests/package.test.mjs`, `tests/admission.test.mjs`, `tests/protocol.test.mjs`, `tests/workflow.test.mjs`, `tests/live-native.test.mjs`: package, negative, loopback, receipt, and real QGIS verification.
- `audit/plugin-audit.json`, `audit/evidence.json`: generated hardened audit artifacts.

# Inputs, outputs, persistence, authority, and provenance

All tool inputs are closed JSON objects. Enrolled project roots and bridge-owned export roots are the only admitted path authorities. Transaction actions are a bounded union for `add_geojson_layer`, `set_single_symbol`, `rename_owned_layer`, `ensure_layout`, and `remove_owned_layer`; fields are typed and length/range bounded. No action accepts code, expressions, commands, SQL, provider strings, URIs, protocol payloads, or credentials. Outputs are bounded observations, immutable content-addressed receipts, hashes, and PNG/PDF layout artifacts.

Canonical source is `C:\Users\rizek\plugins\qgis-bridge`; state is `C:\Users\rizek\.codex\state\plugins\qgis-bridge\v1`. The administrative QGIS image at `C:\Users\rizek\AppData\Local\Programs\QGIS-4.2.0\QGIS 4.2.0`, QGIS profiles, user projects, generated state, plugin cache, marketplace checkout, and Bridge Runtime evidence are distinct. Setup copies only hash-matching source-owned extension files into a dedicated bridge-owned QGIS profile or user plugin directory and records their hashes for exact removal. Transactions checkpoint project bytes and all bridge-owned generated companions before writes.

Application provenance binds the official signed `QGIS-OSGeo4W-4.2.0-1.msi` SHA-256, successful administrative-install log, `qgis-bin.exe` 4.2.0 digest, and PyQGIS `Qgis.QGIS_VERSION`/`QGIS_VERSION_INT` observation. API provenance binds installed PyQGIS modules and the source-owned exact contract reference. Certification also binds clean Git commit, bridge-source/v1 digest, accepted design, template provenance, audit, native canary, receipt observation, and fresh-task catalog evidence.

# Activation and verification

After design acceptance, copy Bridge Runtime's exact reverse-polling template into the absent `qgis-extension` root, implement the authenticated poller, render assets, run tests/audit, and commit clean source. Setup verifies the exact QGIS image, creates a dedicated profile, installs the extension without replacing foreign files, and records an ownership receipt. The coordinator uses an ephemeral localhost endpoint and 256-bit token persisted mode-restricted in bridge state; the extension exposes no general eval path.

The isolated native canary launches QGIS 4.2.0 with a fresh dedicated profile and copied fixture, connects the extension, reads initial state, adds the GeoJSON layer, applies one closed style, creates a layout, saves, independently re-reads the layer/renderer/layout and `.qgz` digest, renders the layout, rolls back, reloads, and proves exact project restoration. It stops only its owned clean process. Certification and promotion then follow Bridge Runtime v1.2 and target `qgis-bridge@personal` plus `qgis-bridge@arkheos`. Fresh-task verification must discover exactly seven Skills and six tools and perform one harmless native inspection.

# Acceptance tests

- Profile/admission tests bind QGIS 4.2.0 PyQGIS and reject every weak or missing admission property.
- Tool/protocol negatives reject unauthenticated polling, raw code/command/SQL/expression/payload fields, traversal, unowned paths/layers, stale revisions, dirty projects, identity drift, and extra properties.
- Package validation proves complete GPLv3 license terms and GPL-3.0-or-later identity, seven Skills, six tools, complete references/assets, accepted design, and template provenance.
- Fixture tests prove receipt ownership, independent native-style observation, and byte-exact rollback.
- Native canary proves add/style/layout/render through real PyQGIS 4.2.0 plus exact restoration.
- Hardened schema-v2 audit passes with zero findings on a clean commit.
- Immutable v1.2 evidence/certificate bind installer, executable, API, write/readback, restoration, and fresh-task catalog digests; promotion refuses drift.
- Personal and public marketplace verification proves source/public/cache identity, selectors, GPL license, seven Skills, six tools, and harmless inspection.

# Intentional absences

No app connector, remote MCP, hosted service, analytics, telemetry, UI automation, browser, Processing algorithm passthrough, SQL engine, arbitrary provider, unrestricted file tool, generic Python runner, or separate product repository is included. No certificate or mutable evidence is committed. QGIS itself and the vendor MSI are not redistributed inside the plugin. A dedicated profile avoids modifying unrelated user QGIS configuration.
