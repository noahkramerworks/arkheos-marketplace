---
name: catalog
description: Inspect the signed ArkheOS product catalog, versions, dependencies, membership terms, platforms, and recovery guarantees without mutation.
---

# Inspect ArkheOS catalog

Read [distribution and recovery](../../references/distribution-and-recovery.md). Call `catalog_inspect` with a product ID only when the user narrowed the request. Report the signed catalog revision, product/version/channel, supported platforms, exact plugin and bridge dependencies, membership requirement, and recovery terms.

Treat cached catalog data as stale evidence unless its signature and expiry verify. Do not install, update, authorize, create checkout, or infer entitlement from catalog visibility.
