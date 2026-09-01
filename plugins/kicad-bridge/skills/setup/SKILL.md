---
name: setup
description: Prepare, enroll, launch, inspect, or close the exact bridge-owned KiCad 10.0.5 IPC environment.
---

# Set up KiCad Bridge

Read [architecture](../../references/architecture.md), [dependency provenance](../../references/dependency-provenance.md), and [security and state](../../references/security-and-state.md). Use `bridge_status` first. Use `setup_bridge` only with `prepare_runtime`, `enroll_root`, `launch_board`, or `close_owned_process`. Enroll the narrowest project root. Launch only a saved `.kicad_pcb` within it. The isolated profile must not change the user's normal KiCad configuration. Close only the recorded bridge-owned process after native inspection proves it clean.
