# Recovery

1. Read `AGENTS.md`, `design/plugin.md`, `bridge/profile.json`, this file, and the current clean Git identity.
2. Verify FreeCAD 1.1.3, executable hashes, the copied adapter provenance, and the exact installed extension hashes.
3. Inspect `%CODEX_HOME%\state\plugins\freecad-bridge\v1` without deleting or rewriting receipts.
4. For an applied receipt, verify its checkpoint SHA-256 before opening the document. Use `rollback_receipt`; never hand-edit the target.
5. If exact restoration or native reload cannot be proved, preserve all evidence and classify `manual-recovery-required`.
6. Re-audit, recertify, promote, install, and verify from a genuinely fresh task after drift.
