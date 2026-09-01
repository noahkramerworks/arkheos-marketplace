---
name: edit
description: Apply one closed revision-guarded Krita paint-layer transaction with checkpoint, independent readback, and immutable receipt.
---

# Edit Krita

Read [actions](../../references/actions.md) and [security and state](../../references/security-and-state.md). Inspect first, then call `apply_transaction` with the exact document path, expected revision, and 1..32 admitted actions. Only paint layers marked by both the `ArkheOS_` prefix and color label 8 may be changed. Return the receipt ID and independently observed saved state. Never translate a request into Python, Krita actions, filters, scripts, raw pixels, or generic properties.
