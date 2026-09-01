---
name: rollback
description: Restore exact FreeCAD pre-state from one immutable receipt and independently verify the native reload.
---

# Roll back FreeCAD

Read [recovery](../../references/recovery.md). Call `rollback_receipt` with one exact `sha256:` receipt ID. The runtime verifies receipt ownership, current post-state, checkpoint integrity, exact byte restoration, native reload, and restored observation. If any comparison fails, stop and classify manual recovery required; never delete or rewrite the receipt or checkpoint.
