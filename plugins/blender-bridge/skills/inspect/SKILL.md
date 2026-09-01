---
name: inspect
description: Inspect an enrolled Blender project with bounded native scene, collection, object, data-block, dependency-graph, material, node, animation, render, dirty, diagnostic, and revision evidence.
---

# Inspect Blender

Read [extension](../../references/extension.md) and [security and recovery](../../references/security-recovery.md). Call `blender_bridge.inspect_project` and follow bounded cursors if returned. Report exact project/executable/add-on identity, connection, revision, dirty state, mode, selection, scene/collection/object/data-block summaries, dependency-graph evaluation, materials/nodes, actions/animation, render settings, and diagnostics. Disconnection or unsupported context is an observation, never permission for UI automation.
