# ArkheOS Marketplace

This repository distributes the free ArkheOS customer bootstrap and the certified free OBS Bridge infrastructure required by Stream Showrunner. ArkheOS provides account authorization, membership status, signed catalog verification, entitlement-gated product delivery, updates, and recovery. OBS Bridge owns typed native OBS inspection, reversible effects, receipts, and rollback.

Paid product archives are not stored in this repository. They are delivered as signed, content-addressed artifacts through `api.arkheos.ai` after ArkheOS verifies the customer's entitlement.

## Install the free infrastructure

```text
codex plugin marketplace add noahkramerworks/arkheos-marketplace --ref main
codex plugin add arkheos@arkheos
codex plugin add obs-bridge@arkheos
```

The source is visible for installation and security inspection, but it is proprietary and all rights are reserved. See [LICENSE](LICENSE). OBS Bridge publication is gated by Bridge Runtime certificate `sha256:e1dc85a39ffb6ace1c1d25bc5aaf34423a1b34b6ffc1412874d4156b955ccfc4`. The signed public catalog snapshot is available at [`catalog/current.json`](catalog/current.json); the runtime source of truth remains `https://api.arkheos.ai/v1/catalog`.

Stream Showrunner is available to ArkheOS members for $10/month or $99/year, including a one-time seven-day no-card trial. OBS Bridge remains free infrastructure.
