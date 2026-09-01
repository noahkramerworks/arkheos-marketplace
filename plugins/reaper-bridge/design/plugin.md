---
schema_version: 1
design_id: plugin-1788210028157-b473a130
kind: plugin
name: reaper-bridge
status: accepted
target_path: "C:\\Users\\rizek\\plugins\\reaper-bridge"
accepted_at: 2026-08-31T21:00:28.156Z
authority_build: "codex-cli 0.149.0 / codex-runtime 0.1.8 / bridge-runtime 0.2.0"
source_digest: 5764bb0167e565cecd6baa60131fd9758f776db49811497e6553f39a51caa144
marketplace: personal
interface_asset_profile: personal-png-v1
mcp_disposition: bundled-server
open_questions: []
---

# Intent and non-goals

REAPER Bridge 0.2.0 is the free source-owned Codex bridge for REAPER 7.79 on Windows x86-64. It binds a compiled native REAPER extension to the official, version-bound REAPER C/C++ extension plug-in API from pinned SDK commit `490ded57668727fba21482fabc50ba9853a457bb`. The extension reverse-polls a bridge-owned authenticated ephemeral loopback coordinator, executes only admitted operations on REAPER's main thread, and returns independent native state observations. REAPER remains authoritative for project, track, FX, render, undo, dirty state, and saved-project truth; the bridge owns installation, authenticated admission, revision gates, checkpoints, receipts, independent readback, exact restoration, and recovery evidence.

The 0.2.0 release upgrades the package from Bridge Runtime profile v1.1 to the machine-enforced v1.2 API contract. `api-contract-admission` is the first certification tier. Admission requires the pinned official SDK and exact installed REAPER identity, non-empty typed reads and writes, independent readback, receipt-bound exact rollback, and negative proof that this is not controller-only, UI automation, screen scraping, raw passthrough, or export-only. Stream Showrunner and every other product workflow remain outside this bridge.

# Complete package tree

The package contains `.codex-plugin/plugin.json`, `.mcp.json`, `agents/openai.yaml`, `AGENTS.md`, README, Apache-2.0 license, package metadata, `.gitignore`, accepted design and hardened audit, `bridge-profile/v1.2`, source and rendered interface assets, six focused Skills (`index`, `setup`, `inspect`, `edit`, `render`, `rollback`), focused references including the exact API contract, JSON schemas for transactions and receipts, a bundled Node MCP coordinator/server, source-copied reverse-polling adapter provenance, a native C++ extension, pinned official REAPER SDK headers with their license and provenance, deterministic build metadata, package/protocol/admission/workflow/live tests, and the built x64 DLL. Generated object and import-library output remains excluded.

# Inputs, outputs, persistence, authority, and provenance

The MCP surface remains nine closed semantic tools: `inspect_installation`, `install_extension`, `remove_extension`, `launch_reaper`, `close_owned_reaper`, `inspect_project`, `apply_transaction`, `render_master`, and `rollback_receipt`. No tool accepts arbitrary code, shell commands, raw protocol payloads, raw REAPER command IDs, unrestricted paths, credentials, or arbitrary plug-in identifiers. Transactions admit only track creation/rename, bounded volume/pan/mute changes, five named stock FX, explicit saved-project mutation, and existing-project master render configuration.

Canonical source is `C:\Users\rizek\plugins\reaper-bridge`. Durable state is `C:\Users\rizek\.codex\state\plugins\reaper-bridge\v1`. The bridge-owned extension target is `C:\Users\rizek\AppData\Roaming\REAPER\UserPlugins\reaper_codex_bridge.dll`; application identity is `C:\Program Files\REAPER (x64)\reaper.exe`. The control contract binds the installed REAPER executable, packaged and installed extension DLLs, pinned SDK provenance, selected official API declarations, and the bridge API contract reference. License material is never read or copied; only a registered/unregistered observation is returned.

# Activation and verification

Release targets are `reaper-bridge@personal` and public `reaper-bridge@arkheos`, both Apache-2.0 and certificate-gated. Bridge Runtime 0.2.0 assesses the v1.2 profile, certifies six ordered tiers, and refuses promotion without a current immutable v1.2 certificate. Codex Runtime installs the exact certified source. Setup installs the exact packaged DLL and restarts REAPER before use. A genuinely fresh task must discover all six Skills and nine closed tools from the intended 0.2.0 cache and perform harmless native inspection.

# Acceptance tests

- Pass manifest, package-tree, schema, protocol-negative, raw-boundary, admission, state-security, workflow, and recovery tests.
- Build the native x64 DLL with the installed MSVC toolchain and pinned REAPER SDK; bind and hash the exact REAPER executable, SDK contract, native source, packaged DLL, and installed DLL.
- Verify REAPER 7.79 loads the extension and returns native application, saved project, integer revision, dirty state, and bounded track observations through the authenticated reverse-polling coordinator.
- In a fresh isolated saved fixture, create and rename a track through typed actions, save it, independently verify the `.rpp` state, roll back from the immutable receipt, and prove byte-for-byte equality with the sealed pre-state checkpoint.
- Pass clean Git provenance, Codex Runtime hardened audit, all six Bridge Runtime v1.2 tiers, promotion readiness for both marketplaces, exact source/cache identity, and fresh-task discovery.

# Intentional absences

There is no product workflow, DAW template library, arbitrary ReaScript, arbitrary native command, raw RPC, raw coordinator payload, arbitrary filesystem access, UI automation, screen scraping, controller-only surface, unattended recording, audio-device reconfiguration, plug-in-store installer, license export, remote coordinator, shared mutable Bridge Runtime dependency, unsigned download path, or mutation of a dirty, unsaved, foreign-owned, path-mismatched, or revision-stale project.
