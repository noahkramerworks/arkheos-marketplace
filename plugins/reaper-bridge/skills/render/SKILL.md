---
name: render
description: Render one revision-bound REAPER master only when the saved project already has explicit render settings and output path.
---

# Render REAPER

Inspect first. `render_master` does not invent render settings: it requires a clean saved project, exact revision, and an absolute output file already represented by the project's native render configuration. The bridge invokes only REAPER's bounded render action, waits for the expected artifact, hashes it, and returns a receipt. Reject missing or ambiguous render configuration.

