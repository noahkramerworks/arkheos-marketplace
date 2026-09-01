# State and security

Durable state lives at `$CODEX_HOME/state/plugins/obs-bridge/v1` or the equivalent `USERPROFILE/.codex` fallback on Windows.

- `enrollment.json` contains only endpoint metadata, negotiated versions, and observation time, and is written only during a mutating transaction preflight. Read-only inspection never creates or updates durable bridge state.
- `receipts/<sha256>.json` contains immutable, content-addressed receipts.
- Writes use same-directory temporary files followed by atomic rename.
- Passwords, tokens, authentication challenges, and credential-like values are redacted recursively.

Tool input rejects credential fields. Logs go to stderr only and must remain bounded. MCP protocol output uses stdout exclusively.

Removal or disablement preserves state. Purging state is a separate explicit lifecycle action. A receipt authorizes rollback only for resources whose `createdByBridge` flag is true; stale or unknown receipts fail closed.
