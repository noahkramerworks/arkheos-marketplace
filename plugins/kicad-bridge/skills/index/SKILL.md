---
name: index
description: Route explicit KiCad Bridge requests across setup, inspection, board editing, artifact export, rollback, and recovery.
---

# KiCad Bridge

Use the narrowest focused Skill. Read [architecture](../../references/architecture.md), [actions](../../references/actions.md), and [security and state](../../references/security-and-state.md). Route runtime preparation, enrollment, isolated launch, or owned shutdown to `$setup`; read-only board state to `$inspect`; closed text/title changes to `$edit`; PNG/JPEG output to `$export`; a known receipt to `$rollback`; and reconstruction or drift to `$recover`. Never substitute UI automation, Python, raw IPC, commands, generic properties, or unrestricted paths.
