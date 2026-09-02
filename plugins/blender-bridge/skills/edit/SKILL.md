---
name: edit
description: Apply one closed Blender DCC transaction with exact clean-file revision, full graph validation, byte checkpoint, native readback, receipt, and automatic exact restoration on failure.
---

# Edit through Blender Bridge

Read [typed actions](../../references/actions.md), [architecture](../../references/architecture.md), and [security and recovery](../../references/security-recovery.md). Inspect first. Build one complete transaction with stable ID, exact expected revision, declared external inputs/writes, and one to one hundred admitted actions. Use `write_pose_action` for complete skeletal clips; never synthesize arbitrary F-curve paths. Validate references and bounds before calling `apply_transaction` once. Report receipt, revisions, changed data-blocks, save result, semantic animation digest, and independent readback. Stale, dirty, mismatched, or recovery-uncertain state blocks writes.
