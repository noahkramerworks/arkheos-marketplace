# QGIS Bridge contributor contract

- Canonical source is `C:\Users\rizek\plugins\qgis-bridge`; `design/plugin.md` is the accepted design authority.
- This package is free GPL-3.0-or-later bridge infrastructure released as `qgis-bridge@personal` and `qgis-bridge@arkheos`.
- Durable state is `%CODEX_HOME%\state\plugins\qgis-bridge\v1`; source, state, dedicated profile, application files, marketplace checkout, cache, and active-task discovery are distinct.
- QGIS 4.2.0 and its documented PyQGIS API are authoritative for project, layer, renderer, layout, save, render, and reload state.
- Keep mutation saved-project-only, clean, expected-revision guarded, checkpointed, independently read back, and sealed in an immutable receipt.
- Mutate only bridge-owned layers/layouts; admit only enrolled GeoJSON and project paths; export only to the bridge-owned export root.
- Never add arbitrary Python, processing expressions, SQL, provider strings, commands, raw payloads, unrestricted paths, UI automation, or screen scraping.
- Bridge Runtime is a build/certification authority, not a runtime dependency; retain `qgis-extension/TEMPLATE-PROVENANCE.json`.
- Preserve bridge-profile/v1.2 API admission, typed reads/writes, independent readback, exact rollback, and all explicit weak-surface rejections.
- Change accepted design before changing public tools, Skills, authority, persistence, transport, or lifecycle.
- Run package tests, the real native canary, hardened Codex Runtime audit, Bridge Runtime v1.2 certification, dual-target promotion, and genuine fresh-task verification before release.
- Recovery starts with this file, then `design/plugin.md`, `bridge/profile.json`, `references/recovery.md`, current Git state, application identity, state receipts, marketplace/cache/enabled state, and fresh discovery.

