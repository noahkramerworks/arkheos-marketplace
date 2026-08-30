# ArkheOS Marketplace

This repository distributes the free ArkheOS customer bootstrap plugin. ArkheOS provides account authorization, membership status, signed catalog verification, entitlement-gated product delivery, updates, and recovery.

Paid product archives are not stored in this repository. They are delivered as signed, content-addressed artifacts through `api.arkheos.ai` after ArkheOS verifies the customer's entitlement.

## Install the free bootstrap

```text
codex plugin marketplace add noahkramerworks/arkheos-marketplace --ref main
codex plugin add arkheos@arkheos
```

The source is visible for installation and security inspection, but it is proprietary and all rights are reserved. See [LICENSE](LICENSE). The signed public catalog snapshot is available at [`catalog/current.json`](catalog/current.json); the runtime source of truth remains `https://api.arkheos.ai/v1/catalog`.

Stream Showrunner is available to ArkheOS members for $10/month or $99/year, including a one-time seven-day no-card trial. OBS Bridge remains free infrastructure.
