---
name: index
description: Route explicit FreeCAD Bridge requests across setup, inspection, parametric editing, export, rollback, and recovery.
---

# FreeCAD Bridge

Use the narrowest focused Skill. Read [architecture](../../references/architecture.md), [actions](../../references/actions.md), and [security and state](../../references/security-and-state.md). Route installation, enrollment, launch, or owned shutdown to `$setup`; read-only document state to `$inspect`; closed parametric changes to `$edit`; STEP/STL output to `$export`; a known receipt to `$rollback`; and reconstruction or drift to `$recover`. Never substitute UI automation, Python, macros, shell, generic properties, or unrestricted paths.
