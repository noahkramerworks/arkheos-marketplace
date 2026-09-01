---
name: inspect
description: Inspect a connected QGIS 4.2.0 project through bounded native project, layer, renderer, layout, CRS, and revision state.
---

# Inspect QGIS

Read [architecture](../../references/architecture.md). Call `inspect_project`; do not mutate. Report application/API identity, exact saved project path and SHA-256, clean/dirty state, revision, CRS, bounded layer inventory with ownership and renderer summaries, and layout names. Treat absence, version drift, dirty state, or path mismatch as evidence, not permission to repair.

