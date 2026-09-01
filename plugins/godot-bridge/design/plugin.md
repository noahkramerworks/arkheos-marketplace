---
schema_version: 1
design_id: plugin-1788204402075-875cd950
kind: plugin
name: godot-bridge
status: accepted
target_path: "C:\\Users\\rizek\\plugins\\godot-bridge"
accepted_at: 2026-08-31T19:26:42.074Z
authority_build: "codex-cli 0.149.0 / codex-runtime 0.1.8 / bridge-runtime 0.2.0"
source_digest: 691b81c1d590eb82ea1b3895b1b1ddb0e3736faee97786beabfdf4f82467fbb7
marketplace: personal
interface_asset_profile: personal-png-v1
mcp_disposition: bundled-server
open_questions: []
---

# Intent and non-goals

Godot Bridge 0.2.0 recertifies the existing reusable Godot boundary against Bridge Runtime's native API admission contract v1.2. The official, version-bound control surface is Godot Engine 4.7's documented `EditorPlugin`, `EditorInterface`, resource, debugger, and export APIs, exercised through the pinned Godot 4.7.1 stable Windows console executable. The project-local addon exposes closed typed editor operations only through a bridge-owned authenticated loopback coordinator. Godot remains authoritative for editor, scene, resource, runtime, viewport, and export state; the bridge owns admission, enrollment, bounded transaction schemas, checkpoints, receipts, independent readback, export verification, and exact rollback.

No game concept, preset policy, packaging, distribution, arbitrary RPC or method dispatch, raw GDScript, shell command, UI automation, screen scraping, unrestricted path, cloud service, or shared Bridge Runtime runtime dependency is added. Products continue to compose this bridge.

# Inputs, outputs, persistence, authority, and provenance

## Operator, triggers, identity, and contributions

The primary operator is Codex. Explicit Godot Bridge requests and reusable native Godot setup, inspection, editing, playtesting, export, rollback, and recovery route through seven focused Skills: `index`, `setup`, `inspect`, `edit`, `playtest`, `export`, and `rollback`. Root `AGENTS.md` remains the fresh-task operating and recovery entrypoint. Shared references own architecture, API admission, action, protocol, export, recovery, and state/security contracts.

Canonical source is `C:\Users\rizek\plugins\godot-bridge`; plugin identity is `godot-bridge`; version is 0.2.0. The package remains `personal-png-v1`, uses one bundled stdio MCP server, and contributes the existing fourteen semantic tools. Release targets are the free selectors `godot-bridge@personal` and `godot-bridge@arkheos`, both gated by a current Bridge Runtime v1.2 certificate. License becomes Apache-2.0.

## API admission, authority, and adapter

The application artifact is `Godot_v4.7.1-stable_win64_console.exe`, version `4.7.1.stable.official.a13da4feb`. The control-surface artifacts are that executable and the source-owned `bridge_plugin.gd` adapter. The surface admits typed reads for project, scene, and playtest state and typed writes for project transactions, playtests, and exports. It is not controller-only, read-only, write-only, export-only, UI-driven, screen-scraped, raw-passthrough, or command-success-only.

Adapter disposition remains `hybrid-extension-batch`: the EditorPlugin reverse-polls an authenticated loopback coordinator for editor-thread operations, while the MCP server performs deterministic revision-bound batch export. Native transaction success requires saved-file hashes plus a separate read process; exact rollback requires byte-identical pre/restored project revisions and restored native observation. The fixed admission probe creates an isolated fixture, enrolls the addon, performs a typed scene transaction, reads state back in a separate process, applies the exact receipt rollback, reads again, and emits content digests without retaining the fixture.

# Complete package tree and migration

Retain and update this complete source-owned package:

- `.codex-plugin/plugin.json`, `.mcp.json`, `.gitignore`, `AGENTS.md`, `README.md`, `LICENSE`, and `package.json`.
- `agents/openai.yaml`.
- `assets/source/logo.svg`, deterministic `assets/logo.png`, and `assets/composer-icon.png`.
- `design/plugin.md` and `bridge/profile.json`.
- `audit/evidence.json` and `audit/plugin-audit.json`.
- `skills/index/SKILL.md`, `skills/setup/SKILL.md`, `skills/inspect/SKILL.md`, `skills/edit/SKILL.md`, `skills/playtest/SKILL.md`, `skills/export/SKILL.md`, and `skills/rollback/SKILL.md`.
- `references/action-contract.md`, `references/api-admission.md`, `references/architecture.md`, `references/export.md`, `references/protocol.md`, `references/recovery.md`, and `references/state-and-security.md`.
- `schemas/transaction.schema.json`, `schemas/observation.schema.json`, `schemas/export.schema.json`, and `schemas/receipt.schema.json`.
- `mcp/coordinator.mjs`, `mcp/export.mjs`, `mcp/godot-process.mjs`, `mcp/operations.mjs`, `mcp/protocol.mjs`, `mcp/server.mjs`, and `mcp/state.mjs`.
- `godot-addon/codex_godot_bridge/plugin.cfg`, `bridge_plugin.gd`, and `bridge_plugin.gd.uid`.
- `tests/fixture-project/project.godot`, existing package/protocol/workflow/export/addon test files, and new `tests/api-admission.mjs` plus its fixed native helper when required.

Migration changes version-bearing metadata from 0.1.6 to 0.2.0, upgrades the bridge profile from v1.1 to v1.2, adds the first certification tier, binds the strong API identity and dual release targets, updates tests and audit evidence, and preserves the fourteen-tool public contract. Existing enrollment ownership, project state, checkpoints, transaction receipts, export receipts, run isolation, and immutable Bridge Runtime v1/v1.1 history remain untouched.

# Activation and verification

Durable bridge state remains beneath `C:\Users\rizek\.codex\state\plugins\godot-bridge\v1`; Bridge Runtime evidence and certificates remain under its separate state root. Source, personal/public marketplace snapshots, installed caches, enabled configuration, active task discovery, enrolled project addons, native processes, and external artifacts are distinct states.

Installation or update never proves activation. Promotion requires a current v1.2 certificate, then Codex Runtime manages each selector. Removal or disablement preserves bridge state and never removes changed addon files. Recovery inspects exact source/Git state, accepted design, profile, application and contract artifacts, audit, immutable evidence/certificate history, marketplaces, caches, enabled state, enrollment ownership, native runtime identity, and then a genuinely fresh task. Exact rollback failure or `manual-recovery-required` blocks release.

# Acceptance tests

- Bridge Runtime assessment admits the profile and binds Godot 4.7 editor API identity; all weak-boundary flags remain false.
- Package tests preserve exactly seven Skills, fourteen semantic tools, four schemas, the authenticated protocol, path confinement, transaction closure, and deterministic assets.
- Protocol-negative tests reject raw RPC, arbitrary code/methods, unsupported actions, stale revisions, foreign addon changes, unsafe paths, malformed variants, unowned processes, export collisions, and command-success without state proof.
- The isolated admission fixture performs a real Godot 4.7 typed write, separate-process native and saved-file readback, immutable receipt rollback, exact byte restoration, and restored native readback.
- The native canary creates and changes a real scene, verifies the scene through Godot, playtests and captures a native debugger viewport, builds and hashes a Windows export, rolls back all project state, unenrolls, and restores exact baseline bytes.
- Codex Runtime package validation, deterministic asset check, and schema-v2 behavioral audit pass with zero blocking findings.
- A clean Git commit certifies all six Bridge Runtime v1.2 tiers and passes promotion for both declared selectors.
- Each marketplace snapshot and installed cache matches canonical source exactly, and a genuinely fresh task discovers seven Skills, fourteen tools, and completes one harmless native installation inspection.

# Intentional absences

There is no app connector, hosted service, browser surface, template, customer product, game-specific workflow, arbitrary execution tool, UI automation, analytics, new route, automatic purge, second state schema, or legacy certificate rewrite. No conventional package part is silently omitted: the package has instructions, manifest, assets, design, profile, Skills, references, schemas, MCP source, native addon, tests, audit evidence/report, package metadata, license, and documented generated state; it intentionally has no separate scripts directory because the MCP/test modules own all runnable behavior.
