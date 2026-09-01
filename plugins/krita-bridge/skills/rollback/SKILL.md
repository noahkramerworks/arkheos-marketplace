---
name: rollback
description: Restore exact Krita document bytes from one immutable bridge receipt and verify native reload plus original state.
---

# Roll back Krita

Read [recovery](../../references/recovery.md). Call `rollback_receipt` only with the exact receipt ID. The bridge verifies receipt ownership, current post-state, checkpoint digest, copied pre-state bytes, native reload, original revision, layer tree, and clean state. If any check fails, preserve evidence and report `manual-recovery-required`; never hand-edit or delete the document.
