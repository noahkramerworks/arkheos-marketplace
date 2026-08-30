---
name: apply
description: Apply a reversible OBS scene plan through typed ensure-scene and ensure-input operations, with preflight, checkpointing, native readback, automatic rollback, and an immutable receipt. Use for generic OBS bridge effects, not product-specific outcome design.
---

# Apply an OBS scene plan

Read [bridge contract](../../references/bridge-contract.md), [OBS protocol](../../references/obs-protocol.md), and [state and security](../../references/state-and-security.md).

Inspect first. Build one complete plan with a stable `planId` and ordered actions:

- `ensure_scene`: `sceneName`.
- `ensure_input`: `sceneName`, `inputName`, `inputKind`, `inputSettings`, and `sceneItemEnabled`.

Call `obs_bridge.apply_scene_plan` once. Do not split a logical outcome across speculative retries. Existing matching resources are reused; conflicts fail closed. Report receipt ID, created versus reused resources, readback evidence, and rollback disposition. If the tool reports uncertain prior effect or manual recovery, stop mutation and inspect current OBS state.
