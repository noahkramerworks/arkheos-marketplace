# FreeCAD Bridge contributor contract

- Canonical source is `C:\Users\rizek\plugins\freecad-bridge`; `design/plugin.md` is the accepted design authority.
- This package is free Apache-2.0 bridge infrastructure released as `freecad-bridge@personal` and `freecad-bridge@arkheos`.
- Durable state is `%CODEX_HOME%\state\plugins\freecad-bridge\v1`; source, state, installed extension, application files, marketplace checkout, cache, and active-task discovery are distinct.
- FreeCAD 1.1.3 and its documented Python API are authoritative for documents, objects, recompute, save, and export.
- Keep mutation saved-document-only, clean, expected-revision guarded, checkpointed, independently read back, and sealed in an immutable receipt.
- Mutate only bridge-owned features and export only to the bridge-owned export root.
- Never add arbitrary Python, macros, commands, raw payloads, generic property editing, unrestricted paths, UI automation, or screen scraping.
- Bridge Runtime is a build/certification authority, not a runtime dependency; retain `freecad-adapter/TEMPLATE-PROVENANCE.json`.
- Preserve bridge-profile/v1.2 API admission, typed reads/writes, independent readback, exact rollback, and all explicit weak-surface rejections.
- Change accepted design before changing public tools, Skills, authority, persistence, transport, or lifecycle.
- Run package tests, native canary, hardened Codex Runtime audit, Bridge Runtime v1.2 certification, dual-target promotion, and genuine fresh-task verification before release.
- Recovery starts with this file, then `design/plugin.md`, `bridge/profile.json`, `references/recovery.md`, current Git state, application identity, state receipts, marketplace/cache/enabled state, and fresh discovery.
