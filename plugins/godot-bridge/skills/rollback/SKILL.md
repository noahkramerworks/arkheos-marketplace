---
name: rollback
description: Restore the exact pre-state recorded by one immutable Godot Bridge receipt and verify project byte identity plus native editor reload.
---

# Roll back a Godot Bridge receipt

Read [recovery](../../references/recovery.md) and [state and security](../../references/state-and-security.md).

Require an exact `sha256:<64 lowercase hex>` receipt ID. Call `godot_bridge.rollback_receipt` once. The bridge restores only receipt-bound targets and verifies their expected pre-state hashes. Repeated rollback is idempotent.

Unknown receipts, changed ownership, foreign edits, missing checkpoints, or reload uncertainty fail closed and require inspection before further mutation.
