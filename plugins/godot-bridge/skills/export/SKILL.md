---
name: export
description: Inspect and build one revision-bound Godot Windows x86-64 release export through external staging, artifact hashing, and an immutable receipt.
---

# Export through Godot Bridge

Read [export contract](../../references/export.md) and [state and security](../../references/state-and-security.md).

Call `godot_bridge.inspect_export` with the exact enrolled `projectRoot` and `presetName`. Stop on any blocker and bind the returned `projectRevision`; do not infer template readiness or repair a product-owned preset.

For a ready preset, require an existing absolute output directory outside the project and an extension-free artifact basename. Call `godot_bridge.build_export` once with the exact revision. Report the export receipt ID, engine and template identities, preset identity, final path, size, and SHA-256.

This Skill exports one verified executable. Product packaging, notices, archives, signing, uploads, and distribution belong to the composing product workflow.

