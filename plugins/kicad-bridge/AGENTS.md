# KiCad Bridge contributor contract

- Canonical source is `C:\Users\rizek\plugins\kicad-bridge`; `design/plugin.md` is the accepted design authority.
- This package is free Apache-2.0 bridge infrastructure released as `kicad-bridge@personal` and `kicad-bridge@arkheos`.
- Durable state is `%CODEX_HOME%\state\plugins\kicad-bridge\v1`; source, state, isolated KiCad profile, board files, marketplace checkout, cache, and active-task discovery are distinct.
- KiCad 10.0.5's installed IPC schema and official `kicad-python` 0.7.1 binding are authoritative for board reads, commits, save, revert, and readback. Export is the separately bound `kicad-cli.exe` 10.0.5 surface.
- Keep mutation saved-board-only, clean, expected-revision guarded, checkpointed, independently read back, and sealed in an immutable receipt.
- Mutate or delete only bridge-owned text; admit only enrolled `.kicad_pcb` paths; export only to the bridge-owned export root.
- Never add arbitrary Python, commands, shell access, raw protobuf/NNG payloads, unrestricted paths, UI automation, screen scraping, or controller emulation.
- Bridge Runtime is a build/certification authority, not a runtime dependency; retain `kicad-adapter/TEMPLATE-PROVENANCE.json` and exact vendored dependency provenance.
- Preserve bridge-profile/v1.2 API admission, typed reads/writes, independent readback, exact rollback, and all explicit weak-surface rejections.
- Change accepted design before changing public tools, Skills, authority, persistence, transport, or lifecycle.
- Run package tests, the real native canary, hardened Codex Runtime audit, Bridge Runtime v1.2 certification, dual-target promotion, and genuine fresh-task verification before release.
- Recovery starts with this file, then `design/plugin.md`, `bridge/profile.json`, `references/recovery.md`, current Git state, application identity, state receipts, marketplace/cache/enabled state, and fresh discovery.
