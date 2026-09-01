---
name: inspect
description: Inspect a connected REAPER installation and active project through bounded native readback without mutation.
---

# Inspect REAPER

Call `inspect_installation`, then `inspect_project`. Native readback includes exact REAPER, extension, ABI, and SDK identity plus saved project path, state-change revision, dirty state, and a bounded track list with name, volume, pan, mute, and FX count.

Treat the returned revision as ephemeral. Re-inspect immediately before any edit. An absent connection, unsaved project, extension mismatch, API drift, or unsupported version is a real stop condition. Read `../../references/reaper-api-contract.md` when interpreting identity failures.
