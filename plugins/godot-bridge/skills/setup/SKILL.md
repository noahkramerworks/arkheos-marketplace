---
name: setup
description: Inspect Godot, enroll or unenroll an exact project, and open, attach, or close a bridge-owned Godot editor without claiming game-product behavior.
---

# Set up Godot Bridge

Read [API admission](../../references/api-admission.md), [architecture](../../references/architecture.md), [protocol](../../references/protocol.md), and [state and security](../../references/state-and-security.md).

Call `godot_bridge.inspect_installation` before enrollment. Require an absolute project root containing `project.godot` and an exact Godot executable. Call `enroll_project`; conflicts fail closed. Repeating enrollment may upgrade only hash-matching bridge-owned addon bytes while preserving the original ownership record. Use `open_project` only after enrollment. `close_owned_editor` may stop only the process identity returned by this bridge.

For unenrollment, call `unenroll_project` once. Report files removed, prior addon-enable state restored, and any hash conflict. Never delete edited or foreign addon files.
