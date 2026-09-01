# Krita Bridge contributor contract

- Canonical source is `C:\Users\rizek\plugins\krita-bridge`; `design/plugin.md` is the accepted design authority.
- This package is free GPL-3.0-or-later bridge infrastructure released as `krita-bridge@personal` and `krita-bridge@arkheos`.
- Durable state is `%CODEX_HOME%\state\plugins\krita-bridge\v1`; source, state, dedicated profile, application files, marketplace checkout, cache, and active-task discovery are distinct.
- Krita 5.3.3 and its installed PyKrita 5.3.3 API are authoritative for document, layer, projection, save, export, and reload state.
- Keep mutation saved-document-only, clean, expected-revision guarded, checkpointed, independently read back, and sealed in an immutable receipt.
- Mutate only paint layers marked by both the `ArkheOS_` prefix and color label 8; admit only enrolled `.kra` paths; export only to the bridge-owned export root.
- Never add arbitrary Python, Krita action/filter passthrough, scripts, commands, raw pixel inputs, raw payloads, unrestricted paths, UI automation, or screen scraping.
- Bridge Runtime is a build/certification authority, not a runtime dependency; retain `krita-extension/TEMPLATE-PROVENANCE.json`.
- Preserve bridge-profile/v1.2 API admission, typed reads/writes, independent readback, exact rollback, and all explicit weak-surface rejections.
- Change accepted design before changing public tools, Skills, authority, persistence, transport, or lifecycle.
- Run package tests, the real native canary, hardened Codex Runtime audit, Bridge Runtime v1.2 certification, dual-target promotion, and genuine fresh-task verification before release.
- Recovery starts with this file, then `design/plugin.md`, `bridge/profile.json`, `references/recovery.md`, current Git state, application identity, state receipts, marketplace/cache/enabled state, and fresh discovery.
