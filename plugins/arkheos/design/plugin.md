---
schema_version: 1
design_id: plugin-1788104394425-56aa4ca8
kind: plugin
name: arkheos
status: accepted
target_path: "C:\\Users\\rizek\\plugins\\arkheos"
accepted_at: 2026-08-30T15:39:54.424Z
authority_build: "codex-cli 0.149.0; desktop runtime 0.150.0-alpha.12.2; node 24.18.0; wrangler 4.127.1"
source_digest: null
marketplace: personal
interface_asset_profile: personal-png-v1
mcp_disposition: bundled-server
open_questions: []
---

# Intent and non-goals

ArkheOS is the customer-platform Codex plugin for discovering, trying, purchasing, installing, updating, verifying, recovering, and removing ArkheOS-distributed products. The operator is a Codex customer. Explicit `@ArkheOS` requests and implicit requests to browse the ArkheOS catalog, start or inspect membership, install or update an ArkheOS product, or recover an ArkheOS-managed installation route through `arkheos:index`.

Version 0.1.1 contributes exactly six focused Skills and one bundled stdio MCP server. The server is necessary because customer OAuth tokens must remain outside model context; entitlement, manifest, and artifact signatures require deterministic verification; local marketplace snapshots and receipts require atomic state; and Codex marketplace installation must be invoked through a closed typed boundary. It exposes no arbitrary HTTP, shell, filesystem, secret-read, or package-install surface.

Version 0.1.1 is a patch reconciliation release. It changes no product, membership, signing, persistence, MCP-tool, or service-API contract. It carries the account-host routing repair already promoted as Cloudflare Worker version `f546708b-49eb-492b-95c5-2ec107590dd3`: admitted account entry routes fetch extensionless `/account`, avoiding the Static Assets redirect loop caused by an explicit `/account.html` fetch. The independently deployed service retains its 0.1.0 health and package identity until a separately planned service release; 0.1.1 versions the distributable plugin and bundled MCP package and makes canonical, public, cached, and freshly discovered package bytes converge.

ArkheOS owns the shared first-party membership and customer distribution substrate. The current commercial contract is USD 10 monthly or USD 99 annually, a one-time seven-day no-card trial per verified customer, full paid access through the paid period plus 30 days after cancellation, and recovery-only access afterward. Recovery-only access preserves inspection, export, verification, recovery, removal, undo, and receipt reading while blocking new product installation, paid mutations, and updates. Reusable application bridges remain free infrastructure; product plugins such as Stream Showrunner remain independently versioned products and compose those bridges.

The source-owned `service/` component is deployed independently to Cloudflare but remains part of this product's canonical package and review boundary. It owns the public catalog, account authorization, trial issuance, Stripe checkout and portal creation, signed webhook projection, membership calculation, release manifests, and content-addressed artifacts. ArkheOS Ops remains the founder-only authority for provider credentials, release promotion, external-operation plans, receipts, and rollback evidence; it is not a customer dependency.

Rollouts bundle `rollout-selection-2026-08-30T15-34-27-519Z-38d68a73` is validated at schema v1 with no source drift. Session `01a0255f-4f09-7df1-ba7c-a0c54f6c30aa`, especially locators 2038, 3561, 3568, 3574, and 3614, supplies observed legacy implementation provenance for account, Stripe, Cloudflare, entitlement, release, and marketplace work. The bundle's annotation is inferred evidence only. Current ArkheOS Ops state and decision `current-membership-governs-customer-products` supersede the legacy Codex, Fixed. product identity, USD 5 card-backed trial, public-MCP scope, and pricing assumptions.

Non-goals are founder credential management, generic provider administration, publisher onboarding or revenue sharing before its existing three-product/100-member gate, absorbing paid product plugins, absorbing application bridges, arbitrary Codex configuration authoring, a generic software store, telemetry, advertising, cloud project-content storage, remote execution of customer projects, browser automation, or claiming that installation proves activation or customer-visible effect.

# Complete package tree

- Plugin identity: `arkheos` version `0.1.1`
- Canonical source root and fresh-task root: `C:\Users\rizek\plugins\arkheos`
- Build marketplace identity: `arkheos@personal`
- Customer bootstrap identity: `arkheos@arkheos` in a separately published Git marketplace snapshot
- Interface asset profile: `personal-png-v1`
- MCP disposition: `bundled-server`
- Cloudflare service identity migrated in place: Worker `fixed-production`, D1 `fixed-production`, KV `fixed-production-config`, R2 `fixed-artifacts`; a later separately planned rename may supersede these physical IDs but is not required for version 0.1.1

```text
arkheos/
|-- .codex-plugin/plugin.json
|-- .mcp.json
|-- AGENTS.md
|-- README.md
|-- agents/openai.yaml
|-- assets/
|   |-- composer-icon.png
|   |-- logo.png
|   `-- source/logo.svg
|-- audit/plugin-audit.json
|-- design/plugin.md
|-- mcp/
|   |-- handler.mjs
|   |-- server.mjs
|   `-- core/
|       |-- api.mjs
|       |-- canonical.mjs
|       |-- crypto.mjs
|       |-- dpapi.mjs
|       |-- operations.mjs
|       `-- state.mjs
|-- package.json
|-- references/
|   |-- architecture.md
|   |-- commerce-and-entitlements.md
|   |-- compatibility-and-migration.md
|   `-- distribution-and-recovery.md
|-- schemas/
|   |-- catalog.schema.json
|   |-- entitlement.schema.json
|   |-- operation-plan.schema.json
|   |-- receipt.schema.json
|   |-- release.schema.json
|   `-- state.schema.json
|-- scripts/
|   |-- arkheos.mjs
|   `-- verify-package.mjs
|-- service/
|   |-- package-lock.json
|   |-- package.json
|   |-- wrangler.jsonc
|   |-- migrations/
|   |   |-- 0001_initial.sql
|   |   `-- 0002_arkheos_membership.sql
|   |-- public/
|   |   |-- account.html
|   |   |-- app.js
|   |   |-- index.html
|   |   `-- styles.css
|   |-- src/
|   |   |-- catalog.mjs
|   |   |-- domain.mjs
|   |   |-- index.mjs
|   |   |-- oauth.mjs
|   |   |-- releases.mjs
|   |   `-- stripe.mjs
|   `-- tests/
|       |-- domain.test.mjs
|       |-- migrations.test.mjs
|       |-- oauth.test.mjs
|       |-- projection.test.mjs
|       |-- releases.test.mjs
|       `-- worker.test.mjs
|-- skills/
|   |-- account/SKILL.md
|   |-- catalog/SKILL.md
|   |-- index/SKILL.md
|   |-- install/SKILL.md
|   |-- recover/SKILL.md
|   `-- update/SKILL.md
|-- templates/catalog.json
`-- tests/
    |-- audit-prompts.test.mjs
    |-- handler.test.mjs
    |-- lifecycle.test.mjs
    |-- package.test.mjs
    |-- security.test.mjs
    `-- state.test.mjs
```

There are no app connectors, hooks, browser extension, native binary, PowerShell file, background daemon, source-tree runtime state, copied credential, customer-data fixture, generic command runner, generic HTTP proxy, public Streamable HTTP MCP, publisher console, or bundled product plugin. `personal-png-v1` owns one SVG master and exactly two deterministic PNG outputs.

# Contributions and workflow ownership

`index` routes only. `catalog` reads the signed public product catalog and explains exact product, version, platform, dependency, membership, and recovery terms without mutation. `account` owns device authorization, verified no-card trial activation, membership inspection, checkout preparation for monthly or annual membership, customer-portal handoff, and local sign-out. `install` owns one entitlement-gated, content-addressed product installation transaction. `update` owns one signed upgrade or rollback transaction for an existing ArkheOS product. `recover` owns receipt inspection, offline verification, export, rollback, removal, and explicit local-state purge.

The bundled MCP contributes these semantic tools: `catalog_inspect`, `account_status`, `authorization_begin`, `authorization_poll`, `trial_activate`, `checkout_create`, `portal_create`, `install_prepare`, `install_execute`, `update_prepare`, `update_execute`, `installation_verify`, `installation_export`, `installation_rollback`, `product_remove`, `receipt_inspect`, `sign_out`, and `state_purge`. Authorization tools return only verification URLs, user codes, bounded status, and expiry; access and refresh tokens are encrypted locally and never returned. Install and update plans are 15-minute, single-use, bind the catalog and release digests, exact plugin identity, current Codex build, current marketplace state, intended filesystem/config effects, and rollback disposition. Execute tools accept only a plan ID, expected digest, and explicit execution flag.

Product delivery uses a free customer bootstrap marketplace plus an entitlement-gated product cache. The remote Git marketplace exposes the free `arkheos` bootstrap plugin and signed public catalog metadata. Bootstrap 0.1.1 embeds only the production Ed25519 public trust root `arkheos-release-2026-08`; the corresponding private key remains founder-only ArkheOS Ops vault state. After authorization, ArkheOS downloads one signed product archive from R2, checks declared length, SHA-256, Ed25519 signature, product identity, version, channel, and minimum Codex build, extracts into a same-directory staging root, verifies the complete manifest, atomically materializes a customer-local `arkheos-products` marketplace beneath plugin state, and invokes the exact installed Codex CLI marketplace/add operation. A failed installation restores prior configuration and package bytes. A download or archive is never treated as installed, enabled, discovered, or effective.

The service exposes bounded HTTPS routes: `GET /health`, `GET /v1/catalog`, OAuth metadata and registration, `POST /v1/device/code`, account approval, token exchange and refresh, `POST /v1/trial`, `POST /v1/billing/checkout`, `POST /v1/billing/portal`, `POST /v1/billing/webhook`, legacy `POST /v1/stripe/webhook`, `GET /v1/entitlement`, `GET /v1/products/:product/releases/:channel`, exact signed `GET /v1/products/:product/releases/:channel/:version`, and authenticated `GET /v1/artifacts/:sha256`. `/v1/billing/webhook` is canonical. The legacy webhook path executes the identical verifier and projection during migration and is removed only in a later release with provider readback.

The exact observed Stripe destination subscribes to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `customer.subscription.updated`, `invoice.paid`, and `invoice.payment_failed`. Every event is signature-verified against the raw body, deduplicated by event ID, projected through an allow-list, and stored with bounded outcome. The no-card trial is ArkheOS-owned and is never represented as a Stripe trial. Monthly and annual checkout create immediate paid subscriptions; Stripe remains authoritative for paid period, cancellation, invoices, and payment failure.

# Inputs, outputs, persistence, authority, and provenance

Customer inputs are a selected catalog product, an installation identity, a device authorization approval, a monthly or annual plan choice, and explicit install/update/remove intent. Outputs are bounded catalog and membership views, hosted authorization/checkout/portal URLs, exact plans, signed release metadata, installation/update/recovery receipts, and verification summaries. No customer project content, local source, prompt history, credentials, payment details, or arbitrary file contents leave the machine.

Local durable state lives at `$CODEX_HOME/state/plugins/arkheos/v1`, falling back to the active user's `.codex` root. It contains `identity.json`, DPAPI-wrapped `auth.json`, `marketplaces/arkheos-products/`, content-addressed `artifacts/`, immutable `receipts/`, expiring `plans/`, and bounded `installations.json`. Source, local state, marketplace registration, installed package cache, enabled configuration, fresh-task discovery, remote catalog, Cloudflare deployment, Stripe state, and observed customer effect remain distinct. Plugin disablement or removal preserves state; `state_purge` is a separately requested destructive operation that refuses while managed products remain installed unless they have been exported or removed.

Remote state remains in the existing production D1/KV/R2 resources until an independently planned migration. Migration `0001_initial.sql` exactly reflects the deployed legacy schema. Migration `0002_arkheos_membership.sql` adds verified account identity, one-time ArkheOS trials, monthly/annual plan identity, paid-through and grace-through timestamps, membership calculation inputs, refresh-token families, catalog products/releases, artifact records, checkout idempotency, portal requests, and audit-safe webhook outcomes. Production readback on 2026-08-30 found zero customers, subscriptions, installations, webhook events, OAuth clients, and OAuth tokens, but migrations remain additive and rollback-safe rather than assuming emptiness.

One verified account may activate one seven-day trial. Membership modes are `trial`, `paid`, `grace`, and `recovery`. Trial ends exactly seven days after server-side activation. Paid access follows Stripe's current paid period. Cancellation or terminal paid status sets grace through paid-period end plus 30 days. Trial, paid, and grace permit admitted paid mutations; recovery permits only inspection, export, verification, recovery, rollback, removal, undo, receipt access, account data export, and account deletion. Clock evaluation is server authoritative, while a bounded signed entitlement lease permits offline recovery but never extends paid mutation authority.

The accepted design and current schema-valid source are authoritative for product behavior. ArkheOS Ops state and immutable decisions govern current business policy, service identities, release promotion, and external-effect evidence. Stripe is authoritative for paid billing state; Cloudflare is authoritative for deployed Worker, D1, KV, R2, routes, and DNS; the signed catalog/release keys are authoritative for distributed bytes; the installed Codex CLI is authoritative for marketplace and plugin discovery. Official OpenAI product documentation is explicitly excluded as installed-runtime authority for this work; observed CLI `0.149.0`, desktop runtime `0.150.0-alpha.12.2`, active tool contracts, local source, and controlled fresh-task observations govern, and their version contradiction is preserved.

The legacy `C:\Users\rizek\plugins\codex-fixed` package and recovered workspace remain untouched provenance. Existing Worker version `f4d41dde-6569-4007-a48f-758873b603d7`, D1 `cfbd62f2-5272-43c6-ad41-4d3da227d962`, KV `d5fc4babe02647d2abefce35c4f35922`, R2 `fixed-artifacts`, and signed Codex, Fixed. 1.0.1 release are migration inputs, not current product authority. Existing credential values remain only in their provider bindings or ArkheOS Ops vault handles; source, plans, tests, logs, and receipts contain handle names or binding names only.

Malformed signatures, clock rollback, token or refresh-family reuse, unsupported Codex build, stale catalog, unknown product, unavailable entitlement, digest mismatch, archive traversal, unexpected package tree, changed marketplace pre-state, ambiguous CLI identity, uncertain install effect, provider timeout, webhook signature failure, release-key mismatch, and state-root failure stop the affected operation. Network loss degrades only to signed cached catalog inspection and recovery-safe local actions; it never grants installation or update authority.

# Activation and verification

Build against observed `codex-cli 0.149.0`, desktop runtime `0.150.0-alpha.12.2`, Node 24.18.0, and Wrangler 4.127.1. Preserve their surface/version distinctions. Build from `C:\Users\rizek\plugins\arkheos`, render `personal-png-v1` assets with pinned `@resvg/resvg-js` 2.6.2, run all package/MCP/service/migration/security/lifecycle tests, run Codex Runtime package validation and blocking audit, and fix every P0-P2 finding.

Register `arkheos` in the personal marketplace without changing unrelated entries, publish the coherent customer bootstrap snapshot, install and enable 0.1.1, compare every source, public snapshot, and cache byte, and launch a genuinely fresh task from the canonical source root. Require discovery of exactly six `arkheos:*` Skills and every bundled MCP tool. Invoke harmless catalog, account-status, signature-verification, and recovery-safe tests. Source presence, marketplace availability, cache identity, enabled configuration, Skill discovery, server discovery, and runtime effect are verified independently.

Service deployment is a separate ArkheOS Ops operation. Before upload, capture the exact current Worker version, bindings, routes, D1 migration state, public health body, webhook behavior, and rollback version. Apply migrations with remote readback, upload a candidate Worker version, verify preview/canary routes, then promote only through a typed confirmed plan. Verify canonical `/v1/billing/webhook` rejects an invalid signature with HTTP 400 and the legacy alias behaves identically before sending one real Stripe test event. Reveal/capture the existing destination signing secret only after action-time founder confirmation; never print it. Production readback must show a signed event accepted once and deduplicated on replay.

Publish the customer bootstrap as a Git marketplace only after package audit and source/cache/fresh-task verification. Publish paid product archives only through ArkheOS Ops release plans with exact artifact hashes, Ed25519 signatures, R2 keys, catalog revision, rollback release, and provider receipts. A fresh customer environment must add the remote marketplace, install `arkheos`, authorize without card, activate the trial, install Stream Showrunner from the signed product cache, discover expected Skills, update through a second signed revision, cancel or expire a bounded test membership, and prove recovery-mode behavior and cleanup.

Fresh-task recovery begins at the canonical source root and reads `AGENTS.md`, this accepted design, all four references, current manifest, package tests, local state summary, installed cache identity, marketplace state, service deployment readback, and ArkheOS Ops release/service records in that order. Rollouts bundles and original builder tasks remain optional provenance after acceptance.

# Acceptance tests

1. The exact planned tree, manifest identity 0.1.1, six focused Skills, bundled MCP declaration, package metadata, and deterministic interface assets match this design with no unaccepted contribution.
2. Every MCP tool is semantic and bounded; no argument or result can carry plaintext access/refresh tokens, Stripe/Cloudflare secrets, arbitrary URLs, arbitrary commands, arbitrary paths, or arbitrary HTTP methods/headers.
3. OAuth device authorization stores tokens only in DPAPI-protected local state, rotates refresh families, detects replay, supports sign-out/revocation, and never exposes token bytes to Codex output or logs.
4. One verified account can activate exactly one seven-day no-card trial; repeated, concurrent, spoofed, unverified, expired, or clock-regressed activation fails without extending access.
5. Monthly and annual checkouts map only to admitted Stripe price identities, are idempotent, do not create Stripe trials, and project the exact seven selected event types with signature verification and event-ID deduplication.
6. Entitlement calculation exactly implements trial, paid, grace through paid-period end plus 30 days, and recovery. Paid mutations stop after grace; inspection, export, verification, recovery, rollback, removal, undo, receipt access, account export, and deletion remain.
7. Catalog and release manifests reject unknown fields, invalid product/version/channel identities, stale or expired data, wrong key IDs, invalid Ed25519 signatures, changed artifact length/hash, unsupported Codex builds, and downgrade unless an exact rollback plan authorizes it.
8. Archives reject traversal, links, device files, duplicate paths, undeclared files, oversized entries, and manifest/tree mismatch. Extraction, local marketplace materialization, config mutation, plugin installation, update, rollback, and removal are atomic or produce an honest recoverable partial receipt.
9. The existing empty production D1 accepts additive migrations and preserves `0001_initial.sql`; migration tests also seed nonempty legacy rows and prove projection, compatibility aliases, downgrade readback, and rollback disposition.
10. `/v1/billing/webhook` and `/v1/stripe/webhook` execute the same verifier/projection; invalid signatures cannot write, valid events write once, duplicates do not reapply, unrelated events are bounded ignored records, and provider timeouts are not retried speculatively.
11. Source, personal marketplace availability, installed cache, enabled configuration, exact six-Skill discovery, MCP discovery, remote Git bootstrap, local paid-product marketplace, service deployment, Stripe acceptance, and fresh-customer effects are each verified separately.
12. Codex Runtime validation and audit pass with no P0-P2 findings; all local and service tests pass; a genuinely fresh task completes harmless catalog/account checks; and the complete checkout-to-entitlement-to-install-to-update-to-cancel/recovery scenario produces immutable ArkheOS Ops releases, receipts, rollback evidence, and a valid audit chain.

# Intentional absences

Version 0.1.1 intentionally has no publisher onboarding, third-party revenue split automation, tax registration automation, legal or tax advice, generic payment processor, lifetime plan, per-product purchase, card-backed trial, public Streamable HTTP MCP, customer project upload, remote project execution, analytics, ads, telemetry, app connector, hook, background updater, arbitrary provider API, generic HTTP/shell/filesystem tool, plaintext token reader, automatic credential reveal, unconfirmed production mutation, bridge implementation, paid product implementation, bundled Stream Showrunner source, auto-start service, source-tree customer state, automatic state purge, or assertion that a download/install proves activation or product effect. It does not rename or destroy legacy Cloudflare resources, delete the Codex, Fixed. release, modify `codex-fixed@personal`, alter Stream Showrunner, or open third-party publishing before its accepted gate.
