---
name: rollback
description: Roll back resources created by one immutable OBS Bridge receipt, in reverse dependency order, and verify restoration through native OBS readback. Use only with an exact receipt ID.
---

# Roll back an OBS Bridge receipt

Read [bridge contract](../../references/bridge-contract.md) and [state and security](../../references/state-and-security.md).

Require an exact receipt ID from prior bridge output or durable state. Call `obs_bridge.rollback_receipt` once. The bridge removes only resources recorded as created by that receipt; pre-existing resources are never removed.

Report whether rollback was performed or already complete and include verification evidence. Unknown receipts, stale resource ownership, connection failure, or readback uncertainty fail closed and require inspection before any further mutation.
