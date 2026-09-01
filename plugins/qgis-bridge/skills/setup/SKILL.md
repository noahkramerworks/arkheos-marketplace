---
name: setup
description: Inspect QGIS 4.2.0, install or remove the owned extension, enroll a project root, and launch or close an owned project.
---

# Set up QGIS Bridge

Read [security and state](../../references/security-and-state.md) and [recovery](../../references/recovery.md). Call `bridge_status` first. Use `setup_bridge` with one closed action: `install_extension`, `remove_extension`, `enroll_root`, `launch_project`, or `close_owned_process`. Enrollment must be an absolute existing directory beneath the current user's profile. Never replace a foreign extension or close a process the bridge did not launch. Report exact application, extension, connection, and receipt identity.

