---
schema_version: 1
design_id: plugin-1788386777041-2e8b4195
kind: plugin
name: blender-bridge
status: accepted
target_path: "C:\\Users\\rizek\\plugins\\blender-bridge"
accepted_at: 2026-09-02T22:06:17.041Z
authority_build: "codex-cli 0.149.0 / codex-runtime 0.1.8 / bridge-runtime 0.2.0"
source_digest: 07adbd7006c8a61cad8796255fc5819112b7b0aa41e1d7ca673149582a454709
marketplace: personal
interface_asset_profile: personal-png-v1
mcp_disposition: bundled-server
open_questions: []
---

# Intent and non-goals

Blender Bridge 0.3.0 adds one bounded, atomic skeletal-animation action to the admitted Blender 5.2.1 LTS boundary. `write_pose_action` authors a complete pose-bone action from finite location, WXYZ unit-quaternion, and positive-scale keys with explicit frame range, replacement policy, interpolation, and auto-clamped Bezier handles. Native inspection and separate-process inspection return bounded semantic animation counts and a reproducible SHA-256 digest. Blender remains authoritative for scene, dependency graph, animation, render, viewport, and export state; the bridge retains enrollment, revisions, checkpoints, receipts, owned jobs and processes, and rollback authority.

No second animation bridge, new Skill, new MCP tool, product-specific rig or clip convention, root-motion policy, arbitrary Python, raw operator or RNA passthrough, free-form driver, UI automation, screen scraping, unrestricted filesystem access, raw protocol payload, cloud service, shared Bridge Runtime dependency, or unbounded animation payload is added.

# Complete package tree

Retain the released manifest, MCP declaration, root operating contract, agents metadata, deterministic SVG/PNG interface assets, accepted design, audit artifacts, seven Skills, six references, three schemas, six MCP modules, five native extension files, eight tests, README, package metadata, license, Git ignore rules, and bridge profile. Modify version-bearing metadata; the accepted design; bridge profile; action, API-admission, extension, render/export, and recovery contracts where behavior changes; the transaction schema; MCP validation, export options, version, and readback surfaces; the native extension transaction, inspection, and batch-export paths; and package, protocol, workflow, admission, extension, and live-canary tests. No conventional package part is otherwise added or removed.

# Inputs, outputs, persistence, authority, and provenance

The bundled `blender_bridge` server retains exactly sixteen closed semantic tools. The existing `apply_transaction` tool admits exactly one new discriminated action, `write_pose_action`. It requires an existing armature object, a bounded action name and inclusive frame range, `reject` or `replace-compatible` write mode, one of `BEZIER`, `LINEAR`, or `CONSTANT` as default interpolation, and one to 4,096 unique bone/frame keys spanning at most 256 existing pose bones. Every key carries at least one admitted transform: finite three-component location, normalized four-component WXYZ quaternion, or finite strictly positive three-component scale. Key frames must be integral and inside the declared range. The existing four MiB payload, 50,000-number transaction, and one-to-one-hundred action limits remain.

`reject` refuses an existing action. `replace-compatible` replaces only a local action whose active/NLA users, if any, are the target armature; library-linked, override, fake-user, or foreign-bound actions fail closed. A successful write creates one object slot, one keyframe layer and strip, explicit pose-bone F-curves, and binds the action to the target armature. Bezier keys receive auto-clamped handles. The legacy `insert_keyframe` remains object-only and is hardened to the explicit transform properties `location`, `rotation_euler`, `rotation_quaternion`, and `scale`, a bounded frame and property-compatible array index, an existing active action, and no undeclared fields.

Every transaction action is a closed discriminated schema in both the MCP contract and coordinator validation. Native dispatch independently rejects unknown action fields. Inspection preserves `blender-bridge/observation/v1` and adds bounded action slot/channel/key counts, bone/property sets, interpolation counts, completeness state, and `sha256:<64>` semantic digests. A digest covers sorted slot/channel/key semantics, including frames, values, interpolation, and handle types, and must reproduce after saving and reopening in an independent Blender process. Actions exceeding the inspection channel/key budget report a bounded status and no partial digest.

GLB export explicitly maps `animation`, `materials`, and new `extras` booleans to the Blender exporter; omission preserves animation and materials while leaving extras off. Other formats retain their existing closed behavior. State remains under `$CODEX_HOME/state/plugins/blender-bridge/v1`; protocol, enrollment, checkpoint, receipt, artifact-receipt, observation, and transaction schema identities remain v1; prior state, receipts, evidence, and certificates remain immutable.

The `bridge-profile/v1.2` remains bound to `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`, the official Blender 5.2.1 Python API runtime, the hybrid extension/batch adapter, clean Git provenance, six certification tiers, and both GPL-3.0-or-later marketplace targets.

# Activation and verification

Canonical source is `C:\Users\rizek\plugins\blender-bridge`; recovery starts in that directory from `AGENTS.md`, this design, the profile, exact Git source, installed Blender identity, and persisted Bridge Runtime history. Build and blocking-audit version 0.3.0 through Codex Runtime 0.1.8; assess, certify, and gate promotion through Bridge Runtime 0.2.0. Marketplace snapshots, cache revisions, enabled configuration, fresh-task discovery, and native effects are separate states. Promotion or installation is not implied by source completion.

The live canary creates an isolated rig, authors and replaces a pose action through the native adapter, saves and independently reopens it, matches the semantic digest, exports GLBs with animation/material/extras enabled and disabled, parses their JSON chunks, verifies expected channel and extras presence/absence, and restores exact baseline bytes. Extension installation/removal remains ownership-bound and recoverable.

# Acceptance tests

- Preserve exactly seven Skill identities, sixteen MCP tool identities, protocol/state/receipt v1 identities, and both release selectors.
- Pass the fully discriminated transaction schema and matching coordinator/native validators; reject unknown fields, non-finite or oversized values, duplicate bone/frame keys, missing bones, invalid quaternions/scales, out-of-range frames, incompatible replacement, and unsafe legacy keyframe paths or indices.
- Reproduce semantic action digests across native save/reopen inspection and prove expected slot, channel, key, bone, property, interpolation, and handle summaries.
- Map GLB animation, materials, and extras options explicitly and prove enabled/disabled artifacts by parsing exported GLB JSON.
- Pass package, protocol, workflow, extension validation/build, fixed API admission, real native canary, deterministic interface-asset verification, and Codex Runtime audit with positive, negative, missing-context, and failure evidence.
- Bind a clean exact Git commit, Blender executable/API identities, hardened audit v2, all six Bridge Runtime tiers, native write/readback, exact restoration, dual release targets, and fresh discovery into new immutable v1.2 evidence and certification before promotion.

# Intentional absences

No new Skill, MCP tool, application boundary, protocol/state/receipt generation, product workflow, rig naming convention, timeline marker, root motion, constraint authoring, NLA editor, arbitrary F-curve/RNA path, generic keyframe batch, new adapter file, remote service, database, website, automatic state purge, application substitution, or rewrite of old evidence/certificates is included.
