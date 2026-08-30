# ArkheOS source instructions

- Treat `design/plugin.md` as the accepted product and package contract.
- Keep this plugin customer-facing. Founder credentials, provider administration, release promotion, and external-effect receipts belong to `arkheos-ops@personal`.
- Keep product plugins and reusable application bridges separate. Bridges remain free infrastructure.
- Never accept, return, print, or log plaintext access tokens, refresh tokens, Stripe secrets, Cloudflare secrets, signing private keys, or payment data.
- The bundled MCP exposes only the closed semantic tools declared in the accepted design. Do not add arbitrary HTTP, shell, filesystem, URL, header, or package-manager parameters.
- Preserve the current membership contract: USD 10 monthly, USD 99 annually, one verified seven-day no-card trial, paid-period access plus 30 days after cancellation, then recovery-only behavior.
- Treat `/v1/billing/webhook` as canonical and `/v1/stripe/webhook` as a temporary compatibility alias executing the same verifier.
- Keep local runtime state under `$CODEX_HOME/state/plugins/arkheos/v1`; never write customer state, credentials, plans, receipts, or downloaded artifacts into source.
- Keep Cloudflare deployment distinct from source, marketplace registration, installation cache, activation, Stripe acceptance, and customer-visible effect.
- The canonical source is `C:\Users\rizek\plugins\arkheos`. Fresh task recovery reads `AGENTS.md`, `design/plugin.md`, all references, local state, manifest, tests, marketplace/cache identity, service readback, and ArkheOS Ops evidence in the accepted order.
- Preserve `C:\Users\rizek\plugins\codex-fixed` and the recovered Codex, Fixed. workspace as legacy provenance only.
- Update schemas, references, implementation, migrations, and tests together when a contract changes.
- Run `npm test`, `npm run verify`, deterministic icon check, Codex Runtime audit, installation verification, and genuinely fresh-task discovery after material changes.
