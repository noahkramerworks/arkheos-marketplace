# State, security, and recovery

Tokens remain in mode-restricted runtime discovery and never enter MCP tool input, logs, receipts, or project files. Enrollments bind canonical `.blend` identity, executable hash, extension hash, and ownership. Dirty state, stale revision, mismatched identity, changed enrollment, or unresolved recovery fails closed.

Every transaction checkpoints exact `.blend` bytes and all declared external write targets before dispatch. On failure the bridge restores exact bytes, reopens the file, and requests independent hash/readback. Uncertainty persists `manual-recovery-required` and blocks subsequent mutation. Explicit rollback is receipt-bound and idempotent; it never touches foreign files or processes.
