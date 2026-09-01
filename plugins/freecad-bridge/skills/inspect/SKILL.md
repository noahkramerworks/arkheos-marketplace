---
name: inspect
description: Inspect the exact FreeCAD installation and active saved document through bounded native API state.
---

# Inspect FreeCAD

Read [API contract](../../references/freecad-api-contract.md). Call `bridge_status`, then `inspect_document`. Return application/build identity, connection, saved document path/hash, clean state, revision, and bounded bridge-owned feature observations. Do not mutate state, inspect unrelated preferences, read arbitrary files, or infer success from process presence.
