---
name: export
description: Export one clean exact-revision bridge-owned QGIS layout to PNG or PDF in the bridge-owned output root.
---

# Export a QGIS layout

Inspect first. Call `export_artifact` with the exact project path, revision, owned layout name, and `png` or `pdf`. The bridge chooses the output path and verifies nonempty bytes and SHA-256. Do not accept caller-selected destinations, arbitrary layout expressions, Processing jobs, commands, or provider configuration.

