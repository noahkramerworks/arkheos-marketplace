---
name: setup
description: Inspect REAPER, install or remove the owned native extension, and launch or close a bridge-owned REAPER instance.
---

# Setup REAPER Bridge

Use `inspect_installation` first. It reports executable identity, version, extension identity, and registration status without reading license material.

Use `install_extension` only for the exact packaged DLL. A foreign target stops closed. Restart REAPER after installation. `launch_reaper` may open an absolute saved `.rpp` in a new owned instance. `close_owned_reaper` closes only the PID recorded by this bridge and refuses a dirty project.

Read `../../references/architecture.md`, `../../references/reaper-api-contract.md`, and `../../references/security-and-state.md` before diagnosing connection, identity, or ownership failures.
