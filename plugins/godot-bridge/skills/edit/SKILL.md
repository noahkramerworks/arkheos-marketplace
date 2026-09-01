---
name: edit
description: Apply one closed Godot scene/resource/script transaction with exact revision binding, typed actions, native readback, checkpointing, and automatic restoration on failure.
---

# Edit through Godot Bridge

Read [action contract](../../references/action-contract.md), [protocol](../../references/protocol.md), and [state and security](../../references/state-and-security.md).

Inspect first. Build one complete transaction with a stable `transactionId`, exact `expectedRevision`, optional project-relative `scenePath`, and one to fifty admitted actions. Use aliases for objects created earlier in the same transaction. Call `godot_bridge.apply_transaction` once.

Do not split one outcome across speculative retries. Report receipt ID, pre/post revisions, changed targets, native readback, and rollback disposition. A stale revision, dirty editor, uncertain restoration, or manual-recovery classification stops further mutation.
