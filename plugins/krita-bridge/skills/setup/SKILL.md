---
name: setup
description: Inspect Krita 5.3.3, install or remove the owned extension, enroll a document root, and launch or close an owned document process.
---

# Set up Krita Bridge

Read [security and state](../../references/security-and-state.md) and [recovery](../../references/recovery.md). Call `bridge_status` first. Use `setup_bridge` with one closed action: `install_extension`, `remove_extension`, `enroll_root`, `launch_document`, or `close_owned_process`. Enrollment must be an absolute existing directory beneath the current user's profile. Launch accepts only an enrolled `.kra` file and uses the bridge-owned isolated profile. Never close a process the bridge did not launch. Report exact application, extension, connection, and receipt identity.
