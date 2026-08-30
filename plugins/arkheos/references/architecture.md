# Architecture and authority

ArkheOS is the shared customer-platform plugin. It owns customer authorization, catalog interpretation, membership presentation, signed product delivery, local installation records, updates, and recovery. Paid product plugins own their product workflows. Reusable application bridges own native application inspection, mutation, readback, receipts, and rollback. ArkheOS Ops owns founder credentials, provider operations, releases, and audit.

The local stdio MCP keeps OAuth tokens outside model context and enforces atomic state, signature checks, short-lived plans, exact CLI invocations, and receipts. Its API client accepts one fixed ArkheOS origin or an injected test transport. Its operation engine accepts only catalog products and release artifacts that passed the signed contract.

The Cloudflare service is deployed independently from `service/`. D1 owns verified customer identity, trials, paid billing projections, token families, and bounded operation records. KV owns the current signed catalog, stable release pointer, and immutable version-addressed signed release manifests. R2 owns immutable content-addressed artifacts. Stripe owns paid subscriptions and invoices. No customer project content enters the service.

Authority order for customer behavior is accepted design, schema-valid source, signed catalog/release records, current local state, installed Codex CLI discovery, and observed external effect. ArkheOS Ops governs business and promotion decisions. Rollouts and legacy projects remain provenance.
