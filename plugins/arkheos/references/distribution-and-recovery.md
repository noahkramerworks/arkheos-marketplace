# Distribution and recovery

The public Git marketplace contains the free ArkheOS bootstrap plugin and public signed catalog metadata. Paid product archives remain entitlement-gated in R2. After authorization, ArkheOS verifies the release manifest, downloads the exact content address, verifies byte length and SHA-256, validates every declared archive entry, materializes a customer-local `arkheos-products` marketplace atomically, and invokes the exact installed Codex CLI.

The bootstrap embeds only the production Ed25519 public trust root `arkheos-release-2026-08`. Its private key is founder-only ArkheOS Ops vault state and never enters source, plugin state, customer state, provider configuration, logs, receipts, or model context. Key rotation requires a bootstrap release that trusts the new public key before catalog or product records are signed exclusively by it.

Every install or update uses one 15-minute single-use plan bound to product, version, release digest, current Codex build, current marketplace state, and rollback disposition. A receipt records requested effect, staged bytes, manifest acceptance, marketplace registration, plugin installation response, cache readback, and observed discovery separately.

Recovery never depends on paid membership. Local verification compares installed package bytes with the recorded manifest. Export produces a bounded content-addressed handoff. Rollback restores the exact prior local marketplace snapshot and plugin version when available. Removal targets only the named managed product. State purge refuses while managed products remain unless they were exported or removed.
