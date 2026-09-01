---
name: index
description: Route explicit Krita Bridge requests across setup, document inspection, paint-layer editing, PNG export, rollback, and recovery.
---

# Krita Bridge

Use the narrowest focused Skill. Read [architecture](../../references/architecture.md), [actions](../../references/actions.md), and [security and state](../../references/security-and-state.md). Route installation, enrollment, launch, or owned shutdown to `$setup`; read-only document state to `$inspect`; closed paint-layer changes to `$edit`; PNG output to `$export`; a known receipt to `$rollback`; and reconstruction or drift to `$recover`. Never substitute UI automation, Python, Krita action/filter passthrough, raw commands, generic properties, pixel payloads, or unrestricted paths.
