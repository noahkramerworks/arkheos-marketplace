---
name: render
description: Start, inspect, capture, or stop a revision-bound bridge-owned Blender render and capture a verified viewport PNG with bounded logs and hashes.
---

# Render through Blender Bridge

Read [render and export](../../references/render-export.md). Bind the current project revision. Start one owned render with an absent external PNG final path, retain `renderId`, inspect bounded logs, and capture only after native completion/readback. Stop only that owned job. Use `capture_viewport`; it uses a suitable live 3D view or deterministic offscreen fallback. Report final paths, dimensions, sizes, and SHA-256 hashes.
