---
name: rollback
description: Restore exact pre-state from one immutable REAPER Bridge receipt and verify saved project bytes.
---

# Roll back REAPER

Call `rollback_receipt` with one receipt ID. The active clean saved project must match the receipt project and post-revision. The bridge uses the native undo block, saves, independently hashes the `.rpp`, and succeeds only if bytes equal the sealed pre-state checkpoint. Never delete or rewrite a receipt.

