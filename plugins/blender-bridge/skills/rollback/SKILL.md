---
name: rollback
description: Restore exact pre-state from one immutable Blender Bridge receipt, reopen the .blend, independently verify byte/native identity, and preserve manual recovery blocks.
---

# Roll back a Blender receipt

Read [security and recovery](../../references/security-recovery.md). Require the exact `sha256:<64 lowercase hex>` receipt ID and call `rollback_receipt` once. The bridge restores only receipt-bound bytes and verifies the reopened project. Repeated rollback is idempotent. Unknown identity, changed ownership, missing checkpoint, foreign edits, or uncertain readback fails closed and retains manual recovery state.
