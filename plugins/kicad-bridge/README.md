# KiCad Bridge

KiCad Bridge 0.1.0 gives Codex a closed, certified boundary to KiCad 10.0.5.

It reads and changes boards through KiCad's official protobuf/NNG IPC API using the official `kicad-python` 0.7.1 binding. Exports are separate, constrained invocations of the exact KiCad 10.0.5 `kicad-cli.exe`. Every edit requires a clean saved board and expected revision, seals the pre-state bytes, performs independent IPC and file readback, and emits an immutable rollback receipt.

The package exposes exactly seven focused Skills and six semantic tools. It never accepts arbitrary Python, commands, raw protocol messages, unrestricted paths, UI automation, or screen scraping.

Selectors after certification:

- `kicad-bridge@personal`
- `kicad-bridge@arkheos`

Canonical design and recovery order live in `design/plugin.md` and `AGENTS.md`.
