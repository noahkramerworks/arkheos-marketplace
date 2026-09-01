# State and security

Durable state is `$CODEX_HOME/state/plugins/godot-bridge/v1` with `enrollments`, `checkpoints`, transaction `receipts`, immutable `export-receipts`, and ephemeral `runtime` directories. Writes are same-directory atomic replacements. Receipts are immutable and content-addressed.

The coordinator binds only to loopback. Runtime tokens are random, process-scoped, user-readable only, redacted recursively, and deleted at shutdown. Project and asset paths are resolved absolutely, confined to their declared roots, and rejected when reparse or symlink traversal escapes.

Only bridge-owned process identities may be stopped. Export output must be outside the project, traverse no reparse entry, collide with no existing artifact, and pass through a unique bridge-owned staging directory. Only that staging directory and a still-byte-identical artifact published by the current failed operation may be cleaned automatically. Removal or disablement preserves state, enrolled projects, and exports. Purge, unenrollment, and artifact deletion are separate explicit effects.
