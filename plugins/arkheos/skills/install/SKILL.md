---
name: install
description: Prepare and execute one entitlement-gated, signed, content-addressed ArkheOS product installation through the native Codex marketplace lifecycle.
---

# Install an ArkheOS product

Read [distribution and recovery](../../references/distribution-and-recovery.md). Resolve the exact product from the signed catalog and inspect membership. Call `install_prepare` for one product, version or stable channel, and current platform. Review the returned exact identities, digests, dependencies, intended marketplace/config effects, and rollback disposition.

When the request already authorizes installation and the plan still matches, call `install_execute` once with its ID and digest. On timeout or uncertain CLI response, call `installation_verify` before any retry. Report staged, registered, installed, enabled, discovered, and product-effect stages separately.
