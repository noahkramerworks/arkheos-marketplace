---
name: edit
description: Apply one closed revision-guarded KiCad board transaction with checkpoint, independent readback, and immutable receipt.
---

# Edit KiCad

Read [actions](../../references/actions.md) and [security and state](../../references/security-and-state.md). Inspect first, then call `apply_transaction` with the exact board path, expected revision, and 1..32 admitted actions. Only `ARKHEOS_BRIDGE:` text may be created, moved, or deleted; title replacement is bounded. Return the receipt ID, independently observed revision, and saved-file hash. Never translate a request into Python, generic properties, commands, raw protobuf, or arbitrary paths.
