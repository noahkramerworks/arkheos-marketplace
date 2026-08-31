# ArkheOS

Customer account, membership, signed product delivery, updates, and recovery for ArkheOS.

ArkheOS is the customer platform for the ArkheOS product family. It owns account authorization, the no-card trial, membership status, a signed catalog, entitlement-gated product delivery, verified updates, and recovery-safe removal.

Version 0.1.1 is the public bootstrap reconciliation release. It contains the account-host routing fix already deployed as Worker version `f546708b-49eb-492b-95c5-2ec107590dd3`: every admitted account entry route resolves through extensionless `/account`, avoiding the Static Assets `.html` canonicalization redirect loop. The independently deployed service keeps its existing 0.1.0 health/API identity; this patch versions the distributable plugin and bundled MCP package.

The plugin includes a narrow local MCP for protected tokens, atomic plans, signed package verification, and immutable receipts. Its separately deployed Cloudflare component lives under `service/`. Founder credentials and release promotion remain in ArkheOS Ops.

Development gates:

```text
npm test
npm run verify
npm --prefix service test
```

Read `design/plugin.md` for the accepted package and lifecycle contract. Runtime state lives outside source under `$CODEX_HOME/state/plugins/arkheos/v1/`.
