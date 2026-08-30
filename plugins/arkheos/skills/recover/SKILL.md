---
name: recover
description: Inspect ArkheOS receipts, verify or export installed products, roll back, remove a managed product, or explicitly purge safe local state.
---

# Recover ArkheOS

Read [distribution and recovery](../../references/distribution-and-recovery.md) and [compatibility and migration](../../references/compatibility-and-migration.md). Recovery remains available without paid membership.

Use `receipt_inspect` for exact history, `installation_verify` for byte/readback checks, `installation_export` for a content-addressed handoff, and `installation_rollback` for a named eligible receipt. `product_remove` removes only the named managed product. `state_purge` is destructive and must follow explicit purge intent; it refuses while unexported managed products remain.

Never claim restored activation from local bytes alone. Launch a genuinely fresh task for discovery verification.
