---
name: inspect
description: Inspect a connected Krita 5.3.3 document through bounded native identity, dimensions, color, dirty, layer-tree, and revision state.
---

# Inspect Krita

Read [architecture](../../references/architecture.md). Call `inspect_document`; do not mutate. Report application/API identity, exact saved document path and SHA-256, dimensions, color model/depth/profile, clean/dirty state, revision, and the bounded layer tree with ownership, opacity, visibility, and position. Treat absence, version drift, dirty state, or path mismatch as evidence, not permission to repair.
