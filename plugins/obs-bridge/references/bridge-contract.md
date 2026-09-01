# OBS Bridge contract

OBS Studio 32.2.1 is authoritative. The admitted control surface is its bundled obs-websocket 5.7.4 native protocol at RPC 1. The bridge may claim success only after a typed native request succeeds and a separate native readback proves the requested state.

Admission requires non-empty typed reads and writes, independent readback, and exact restoration. Controller-only access, UI automation, screen scraping, raw request passthrough, export-only behavior, arbitrary code or commands, unrestricted paths, and command-exit claims are rejected.

The mutation pipeline is fixed:

1. Connect and negotiate capabilities through `GetVersion`.
2. Validate the complete plan before the first effect.
3. Capture bounded pre-state and its fingerprint.
4. Apply actions serially.
5. Read every touched resource back independently.
6. Seal a receipt, or roll back only resources created by the current receipt.
7. Read back the restored state and classify any uncertainty as `manual-recovery-required`.

Plans contain only `ensure_scene` and `ensure_input`. Existing resources may be reused only when their names, types, and owning scenes agree with the plan. The bridge never removes a pre-existing resource and never exposes arbitrary OBS RPC.

Product Skills compose these primitives. They do not live in this package and may not bypass bridge verification.
