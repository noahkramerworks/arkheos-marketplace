# Recovery

1. Read `AGENTS.md`, the accepted design, this file, and `bridge/profile.json`.
2. Inspect the exact Git revision and verify KiCad, CLI, Python, IPC schema, adapter template, and wheel hashes.
3. Inspect durable enrollments, isolated profile, owned-process record, checkpoints, receipts, and exports without treating them as source.
4. If a process record is stale, remove only that record after proving the PID no longer names the bound `pcbnew.exe`.
5. Roll back only through a known immutable receipt whose current bytes match its recorded post-state.
6. Re-run package tests and the isolated native canary, then audit, certify, promote, reinstall, and verify from a genuinely fresh task.
