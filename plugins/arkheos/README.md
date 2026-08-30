# ArkheOS

Customer account, membership, signed product delivery, updates, and recovery for ArkheOS.

ArkheOS is the customer platform for the ArkheOS product family. It owns account authorization, the no-card trial, membership status, a signed catalog, entitlement-gated product delivery, verified updates, and recovery-safe removal.

The plugin includes a narrow local MCP for protected tokens, atomic plans, signed package verification, and immutable receipts. Its separately deployed Cloudflare component lives under `service/`. Founder credentials and release promotion remain in ArkheOS Ops.

Development gates:

```text
npm test
npm run verify
npm --prefix service test
```

Read `design/plugin.md` for the accepted package and lifecycle contract. Runtime state lives outside source under `$CODEX_HOME/state/plugins/arkheos/v1/`.
