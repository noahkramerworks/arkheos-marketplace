---
name: update
description: Check, prepare, apply, verify, or roll back one signed ArkheOS product update with exact current and target identities.
---

# Update an ArkheOS product

Read [distribution and recovery](../../references/distribution-and-recovery.md). Inspect the current managed installation, catalog, entitlement, and Codex build. Call `update_prepare` with one product and target version or stable channel. Reject silent downgrades, stale manifests, changed marketplace pre-state, or unavailable rollback bytes.

Execute one matching plan with `update_execute`. Verify installed cache and fresh-task discovery independently. Use `installation_rollback` only for an exact recorded receipt and report whether the prior package and configuration were fully restored.
