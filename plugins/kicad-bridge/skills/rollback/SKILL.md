---
name: rollback
description: Restore exact pre-state from one immutable KiCad Bridge receipt and verify native revert plus original bytes.
---

# Roll back KiCad

Read [security and state](../../references/security-and-state.md). Call `rollback_receipt` only with a known receipt ID. The current clean board must match the receipt's exact post-revision and bytes. Report restored SHA-256, restored revision, and `exactBytes`. Do not copy checkpoints manually, roll back a drifted board, or treat an undo command as proof.
