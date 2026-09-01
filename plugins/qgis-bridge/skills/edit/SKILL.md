---
name: edit
description: Apply one closed revision-guarded QGIS layer or layout transaction with checkpoint, independent readback, and immutable receipt.
---

# Edit QGIS

Read [actions](../../references/actions.md) and [security and state](../../references/security-and-state.md). Inspect first, then call `apply_transaction` with the exact project path, expected revision, and 1..32 admitted actions. Only bridge-owned layers/layouts may be changed or removed. Return the receipt ID and independently observed saved state. Never translate a request into Python, expressions, SQL, provider strings, or generic renderer properties.

