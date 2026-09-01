---
name: edit
description: Apply one closed revision-guarded FreeCAD parametric transaction with checkpoint, native readback, and receipt.
---

# Edit a FreeCAD document

Read [actions](../../references/actions.md) and [security and state](../../references/security-and-state.md). Inspect first. Require the exact active saved document path, a clean state, and its current `sha256:` revision. Call `apply_transaction` with 1..32 admitted actions only. Treat the returned native observation, post-file hash, and receipt as the effect proof. On failure, preserve the checkpoint and route to rollback or recovery; never retry blindly.
