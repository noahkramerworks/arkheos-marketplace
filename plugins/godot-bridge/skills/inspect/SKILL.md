---
name: inspect
description: Inspect an enrolled Godot project through native bridge state, including revision, scene tree, scripts, resources, diagnostics, imports, and playtest status.
---

# Inspect a Godot project

Read [protocol](../../references/protocol.md) and [state and security](../../references/state-and-security.md).

Call `godot_bridge.inspect_project` with an absolute `projectRoot`. Follow `nextCursor` until the requested bounded state is complete. Report connection, engine/addon versions, revision, dirty state, active scene, tree/resource/script summaries, diagnostics, import state, and playtest state.

Missing enrollment, disconnected editor, stale runtime discovery, or unsupported protocol are observations, not permission to mutate or fall back to UI automation.
