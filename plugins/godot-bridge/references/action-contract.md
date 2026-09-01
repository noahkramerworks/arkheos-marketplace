# Action contract

Transactions admit only: `scene.create`, `scene.instantiate`, `scene.save`, `node.create`, `node.remove`, `node.move`, `node.rename`, `node.duplicate`, `node.set_property`, `script.write`, `script.attach`, `script.detach`, `signal.connect`, `signal.disconnect`, `resource.create`, `resource.set_property`, `project.input_action.ensure`, and `asset.import`.

Each action is a closed object. Required fields are:

- `scene.create`: `path`, `rootType`, `rootName`; optional `alias`.
- `scene.instantiate`: source `path`, `parent`; optional `alias`. `scene.save` has no fields beyond `type`.
- `node.create`: `parent`, `nodeType`, `name`; optional `alias`. `node.remove`: `target`. `node.move`: `target`, `parent`. `node.rename`: `target`, `name`. `node.duplicate`: `target`; optional `parent`, `name`, `alias`. `node.set_property`: `target`, `property`, `value`.
- `script.write`: `path`, exact UTF-8 `content`. `script.attach`: `target`, `scriptPath`. `script.detach`: `target`.
- `signal.connect` and `signal.disconnect`: `source`, `signal`, `target`, `method`.
- `resource.create`: admitted `resourceType`, `path`; optional `properties`, `alias`. `resource.set_property`: `path`, `property`, `value`.
- `project.input_action.ensure`: `name`; optional `deadzone` from 0 through 1. `asset.import`: absolute existing `sourcePath`, project `targetPath`.

All project paths are confined `res://` paths without traversal. Existing nodes use NodePath strings; created objects use unique aliases that are visible only to later actions. Values are JSON scalars, arrays, dictionaries without `$type`, or exact tagged objects. Numeric tags use only `$type` plus a numeric `value` array: `Vector2` (2 numbers), `Vector3` (3), `Vector4`, `Color`, `Rect2`, and `Quaternion` (4), `Transform2D` (6), `Basis` (9), and `Transform3D` (12). `NodePath` uses only `$type` plus `path`; `Resource` uses only `$type` plus confined `path`; a prior `Alias` uses only `$type` plus `alias`. Raw method calls, expressions, shell commands, arbitrary filesystem operations, forward aliases, malformed variants, and unknown fields are rejected before dispatch.

Every transaction validates completely, binds a clean revision, checkpoints touched bytes, applies serially, saves, and reads touched state back. A request acknowledgment is not success.

The bound revision covers all project-owned source and asset bytes except `.git`, `.godot`, the enrolled bridge addon, and generated `.import` sidecars. Verified receipts record both pre- and post-state hashes for every touched target so asset-only transactions remain rollback-safe. Legacy receipts retain their original revision comparison.

`scenePath` binds scene actions but does not itself make the scene a changed target. Script-, resource-, project-setting-, and asset-only transactions must not load, repack, checkpoint, or rewrite an otherwise unchanged scene. Before a real scene mutation, the addon activates the target tab, rejects unsaved or untracked editor state, closes the clean tab, writes through Godot, and reopens the verified scene. This prevents Godot's external-file-change dialog from racing the bridge.
