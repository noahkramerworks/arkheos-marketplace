---
name: export
description: Export one clean revision-bound FreeCAD document to STEP or STL through the closed batch adapter.
---

# Export FreeCAD

Read [architecture](../../references/architecture.md). Inspect first and require a clean saved document at the exact expected revision. Call `export_artifact` with format `step` or `stl`; output is always selected by the bridge beneath its owned export root. Report returned path, bytes, SHA-256, source revision, and format. Do not pass scripts, arguments, object selectors, or arbitrary destinations.
