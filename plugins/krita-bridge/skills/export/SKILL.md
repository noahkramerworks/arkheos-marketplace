---
name: export
description: Export one clean exact-revision Krita document projection to PNG in the bridge-owned output root.
---

# Export a Krita document

Inspect first. Call `export_artifact` with the exact document path, revision, and fixed `png` format. The bridge chooses the output path, obtains the native PyKrita projection, and verifies nonempty bytes and SHA-256. Do not accept caller-selected destinations, export configurations, filters, scripts, commands, or raw payloads.
