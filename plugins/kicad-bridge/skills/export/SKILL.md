---
name: export
description: Export one clean exact-revision KiCad board to a bridge-owned PNG or JPEG through the bound KiCad CLI surface.
---

# Export KiCad

Read [KiCad API contract](../../references/kicad-api-contract.md). Inspect first. Call `export_artifact` only with the exact open board path, current revision, and `png` or `jpeg`. Return the source revision, output path, bytes, and SHA-256. Keep the distinction explicit: inspection and editing use IPC; export uses the separately certified fixed `kicad-cli 10.0.5 pcb render` surface. Do not accept output paths or CLI options from the caller.
