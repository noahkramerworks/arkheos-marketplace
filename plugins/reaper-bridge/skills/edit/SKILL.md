---
name: edit
description: Apply one closed revision-guarded REAPER track transaction with checkpoint, native readback, receipt, and rollback boundary.
---

# Edit REAPER

Read `../../references/actions.md` and `../../references/reaper-api-contract.md`, then inspect the project first. Call `apply_transaction` with the exact saved project path, observed integer revision, and no more than 32 admitted actions.

Admitted actions are `create_track`, `rename_track`, `set_track_volume`, `set_track_pan`, `set_track_mute`, and `add_stock_fx`. Track indices are zero-based. A transaction stops closed on dirty state, stale revision, path mismatch, unsupported FX, or failed native readback. Preserve the returned receipt ID for rollback.
