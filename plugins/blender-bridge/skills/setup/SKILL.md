---
name: setup
description: Inspect Blender, install or remove the owned native extension, enroll or unenroll an exact .blend, and open or close a bridge-owned Blender process.
---

# Set up Blender Bridge

Read [API admission](../../references/api-admission.md), [extension](../../references/extension.md), and [security and recovery](../../references/security-recovery.md). Inspect installation first; bind exact Blender 5.2.1 executable version/hash. Install the extension only through Blender's validate/build/install commands into `user_default`, recording prior state and hashes. Enroll only an existing clean `.blend`. Open through the bound executable and close only the returned owned process. Removal and unenrollment touch only hash-matching owned state and restore recorded prior state.
