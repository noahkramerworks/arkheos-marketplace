---
name: playtest
description: Start, inspect, capture, and stop a bridge-owned Godot playtest with revision binding, structured events, bounded logs, and native viewport evidence.
---

# Playtest through Godot Bridge

Read [protocol](../../references/protocol.md) and [state and security](../../references/state-and-security.md).

Inspect the project and bind `expectedRevision`, then call `start_playtest`. Retain the returned `runId`. Use `inspect_playtest` with cursors for bounded events and `capture_viewport` for PNG evidence. Always use `stop_playtest` for bridge-owned runs when the workflow is complete.

Never stop an unowned Godot process. A missing run, changed project revision, disconnected editor, debugger failure, or capture mismatch must be reported explicitly.
