---
name: inspect
description: Inspect the connected KiCad 10.0.5 board through bounded native IPC and saved-file state.
---

# Inspect KiCad

Read [KiCad API contract](../../references/kicad-api-contract.md). Call `bridge_status`, then `inspect_board`. Report application/API identity, exact board path, saved SHA-256, revision, dirty state, title, bounded layers, counts, footprints, bridge-owned text, and selection. Treat dirty or identity drift as a stop condition for change, export, or shutdown. Do not infer state from the screen or command success.
