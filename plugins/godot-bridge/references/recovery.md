# Recovery

Inspect the receipt and current project before restoration. Every target must either match the receipt's post-state hash or already match its pre-state hash. Restore exact checkpoint bytes or remove receipt-created files, reload native editor state, then verify the project revision.

Receipts created before target post-state hashes were recorded use the legacy bounded-source revision for compatibility. New receipts require both the complete project revision and exact target post-state bytes before restoration.

Missing checkpoints, foreign edits, ownership drift, or failed reload produce `manual-recovery-required`. Never improvise a merge during rollback. Repeating an already verified rollback returns `already-restored`.

Export receipts are non-rollbackable artifact evidence stored separately in `export-receipts`. Recovery verifies the recorded project revision, preset hash, engine and template identities, final path, size, and SHA-256. A missing or changed artifact is reported; it is never reconstructed or deleted from receipt evidence alone.

When an editor is connected, rollback preparation happens before checkpoint bytes are replaced. The addon closes only clean open `.tscn` targets and rejects dirty or untracked scenes without touching disk. After restoration, it scans and reopens those exact scenes before the receipt can claim `verified-restored`; external byte replacement never races an open scene tab.
