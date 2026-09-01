---
name: setup
description: Inspect FreeCAD 1.1.3, install or remove the owned extension, enroll a project root, and launch or close an owned document.
---

# Set up FreeCAD Bridge

Read [security and state](../../references/security-and-state.md) and [recovery](../../references/recovery.md). Call `bridge_status` first. Use `setup_bridge` with one closed action: `install_extension`, `remove_extension`, `enroll_root`, `launch_document`, or `close_owned_process`. Enrollment must be an absolute existing directory beneath the current user's profile; the runtime applies its stricter path gate. Never replace a foreign extension or close a process the bridge did not launch. Report restart requirements and receipt identity.
