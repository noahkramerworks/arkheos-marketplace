---
schema_version: 1
design_id: plugin-1788214178604-5fd0c808
kind: plugin
name: kicad-bridge
status: accepted
target_path: "C:\\Users\\rizek\\plugins\\kicad-bridge"
accepted_at: 2026-08-31T22:09:38.604Z
authority_build: "codex-cli 0.149.0 / codex-runtime 0.1.8 / bridge-runtime 0.2.0"
source_digest: null
marketplace: personal
interface_asset_profile: personal-png-v1
mcp_disposition: bundled-server
open_questions: []
---

# Intent and non-goals

Build `kicad-bridge` 0.1.0 as the source-owned, free application boundary between Codex and KiCad 10.0.5. The primary operator is Codex. The bridge exposes exactly six closed semantic tools for status, setup, bounded board inspection, revision-guarded board transactions, deterministic export, and receipt rollback. It uses KiCad's official protobuf/NNG IPC API through the official `kicad-python` 0.7.1 binding for all live reads and writes. Export is a separate closed invocation of the exact KiCad 10.0.5 `kicad-cli.exe`; it is never described as an IPC capability. Non-goals are schematic editing, arbitrary Python, arbitrary command execution, raw protobuf/NNG payloads, unrestricted filesystem access, UI automation, screen scraping, controller emulation, silent mutation of an already-dirty document, or support for versions other than 10.0.5.

The one defensible adapter is `protocol-only`. The accepted application artifact is `pcbnew.exe` 10.0.5.50609/product 10.0.5 at the current-user KiCad 10.0 install. The API contract is KiCad IPC API plus `kicad-python` 0.7.1. Typed reads are application identity, open-board identity, board digest, counts, title block, layers, footprints, tracks, vias, text, and selection. Typed writes are create text, move text, set title-block title, and delete bridge-created text inside an IPC commit. Independent readback re-queries the board through a new API read and hashes the saved `.kicad_pcb`. Exact rollback drops an unpushed commit on failure or restores the sealed pre-state checkpoint and reopens/re-reads it for an applied receipt.

# Complete package tree

- `.codex-plugin/plugin.json`: identity, version, Apache-2.0 license, Skills root, and personal interface assets.
- `.mcp.json`: one bundled stdio server rooted at `mcp/server.mjs`.
- `agents/openai.yaml`: concise interface metadata and focused-Skill routing prompt.
- `AGENTS.md`: canonical source root, state root, recovery order, and local truth rules.
- `README.md`: user-facing bridge purpose, exact boundary, setup, selectors, and verification summary.
- `LICENSE`: Apache-2.0 for bridge-owned source; vendored dependency notices remain separately authoritative.
- `assets/source/logo.svg`, `assets/logo.png`, `assets/composer-icon.png`: one source master and deterministic personal-png-v1 outputs.
- `design/plugin.md`: this accepted source-owned design.
- `bridge/profile.json`: closed bridge-profile/v1.2 declaration for KiCad 10.0.5, IPC API, adapter, tests, canary, rollback, and personal plus arkheos release targets.
- `references/architecture.md`, `references/actions.md`, `references/security-and-state.md`, `references/recovery.md`, `references/kicad-api-contract.md`, `references/dependency-provenance.md`: shared operating contracts and exact version/hash evidence.
- `skills/index/SKILL.md`, `skills/setup/SKILL.md`, `skills/inspect/SKILL.md`, `skills/edit/SKILL.md`, `skills/export/SKILL.md`, `skills/rollback/SKILL.md`, `skills/recover/SKILL.md`: seven focused workflows, each delegating effects only to the six bundled semantic tools.
- `schemas/transaction.schema.json`, `schemas/receipt.schema.json`: closed transaction and immutable receipt contracts.
- `mcp/server.mjs`, `mcp/operations.mjs`, `mcp/state.mjs`, `mcp/kicad-client.mjs`: MCP framing, six-tool catalog, path admission, receipts/checkpoints, fixed Python client orchestration, and typed result validation.
- `kicad-adapter/TEMPLATE-PROVENANCE.json`, `kicad-adapter/adapter/README.md`, `kicad-adapter/adapter/client.py`, `kicad-adapter/vendor/PROVENANCE.json`, and pinned wheels under `kicad-adapter/vendor/`: the Bridge Runtime protocol-only template provenance, fixed official IPC client, and offline-installable exact Python dependency set.
- `scripts/setup-python.mjs`, `scripts/live-canary.mjs`: closed setup and isolated native canary orchestration.
- `fixtures/minimal.kicad_pcb`: source-owned deterministic empty-board fixture.
- `tests/package.test.mjs`, `tests/admission.test.mjs`, `tests/protocol.test.mjs`, `tests/workflow.test.mjs`, `tests/live-native.test.mjs`: complete package, weak-input rejection, IPC identity, receipt/rollback, and real KiCad canary tests.
- `audit/plugin-audit.json`, `audit/evidence.json`: current hardened Codex Runtime audit and its evidence, generated only after the release candidate is complete.

# Inputs, outputs, persistence, authority, and provenance

Tool inputs are closed JSON objects. Paths must be absolute, canonical, have an admitted extension, and remain beneath an explicitly enrolled project root or bridge-owned state/export root. Transaction actions are a bounded discriminated union; no field can carry code, commands, protocol payloads, credentials, tokens, environment changes, or generic property names. Outputs are bounded structured observations, content-addressed receipts, hashes, and admitted export artifacts.

Canonical source is `C:\Users\rizek\plugins\kicad-bridge`. Durable generated state is `C:\Users\rizek\.codex\state\plugins\kicad-bridge\v1`. The KiCad user configuration, open board, saved project files, plugin cache, marketplace checkout, and Bridge Runtime evidence store are separate authorities and never treated as source. Setup may create a bridge-owned Python environment in state and may enable KiCad's documented API server only after checkpointing `kicad_common.json`; the setup receipt owns that exact reversible change. Transactions checkpoint exact bytes before mutation and never overwrite a foreign checkpoint or receipt.

Application identity binds the signed KiCad 10.0.5 installer/runtime, `pcbnew.exe`, `kicad-cli.exe`, and installed API schema. Contract identity binds the installed `api.v1.schema.json`, official `kicad-python` 0.7.1 wheel, all vendored wheel hashes, and the bridge's API contract reference. Git commit, fixed bridge-source/v1 tree digest, template provenance, design digest, audit digest, application digests, and contract digests enter certification evidence. Runtime and marketplace state do not rewrite source provenance.

# Activation and verification

Build from the canonical source only after this design is accepted. Copy Bridge Runtime's exact protocol-only template into the absent `kicad-adapter` root, retain its provenance, implement the fixed client, render interface PNGs, and run package plus native tests and the hardened generic audit. Commit a clean exact revision before certification.

Setup verifies KiCad 10.0.5 executable hashes, creates the offline pinned Python environment, checkpoints then enables the API server when needed, and records a receipt. The isolated canary copies the fixture to a fresh temporary project root, launches a bridge-owned PCB Editor instance, connects through IPC, reads initial state, creates and moves one labeled board text object in a commit, saves, re-reads through IPC and saved bytes, invokes one constrained export, rolls back by receipt, and proves restored bytes equal the pre-state hash. It then closes only its owned clean process.

Certification must pass the six v1.2 tiers in order and bind a fresh-task thread/catalog digest. Promotion must return `promotion-ready` for `kicad-bridge@personal` and `kicad-bridge@arkheos`. Installation, cache identity, enabled configuration, fresh-task discovery of exactly seven Skills and six tools, and one harmless native inspection are verified separately for both marketplace targets.

# Acceptance tests

- Profile assessment admits one official version-bound native API and rejects missing typed reads/writes, readback, rollback, or any weak-surface flag.
- All six MCP schemas have `additionalProperties: false`; negative tests reject raw code, shell, commands, raw payloads, traversal, wrong extensions, stale revisions, dirty documents, foreign receipts, and version drift.
- Package validation finds exactly seven focused Skills, six tools, complete assets, declared references, template provenance, dependency provenance, accepted design, and no undeclared contribution.
- Unit and isolated fixture tests prove deterministic state hashing, checkpoint ownership, independent readback, and exact rollback.
- Native canary on KiCad 10.0.5 proves IPC read/write, saved-file change, constrained export, and exact restoration without UI automation.
- Hardened Codex Runtime audit is schema v2, passed, and has zero findings; source is clean and committed.
- Bridge Runtime certification emits immutable bridge-evidence/v1.2 and bridge-certification/v1.2; promotion refuses drift.
- Fresh-task verification proves exact source/public/cache identity, selector/license correctness, seven Skills, six tools, and harmless native inspection.

# Intentional absences

No Codex app connector, remote MCP, hosted service, analytics, telemetry, UI-automation dependency, browser surface, template pack, arbitrary script runner, generic filesystem tool, raw IPC tool, or separate product repository is included. No in-process KiCad plugin is needed because the official IPC endpoint is the authority. No source-owned certificate or mutable runtime evidence is included; immutable evidence lives in Bridge Runtime state. No vendored KiCad application binary is included. Export is not falsely folded into the KiCad 10 IPC contract.
