# Security and state

Durable state lives beneath `%CODEX_HOME%\state\plugins\kicad-bridge\v1`. Enrollments admit only canonical absolute roots. Boards must remain inside an enrolled root and end in `.kicad_pcb`; exports remain inside the bridge-owned export root.

KiCad 10 IPC has no dirty-flag read. The bridge therefore admits only a process it launched on a saved board and immediately seals a synchronized pair: exact saved-file SHA-256 plus native in-memory serialization SHA-256 and revision. Any later change to either surface is treated as dirty until a bridge transaction saves and independently re-reads a new synchronized pair. Exact pre-state bytes are written to a content-addressed checkpoint before an IPC commit. A receipt is accepted only if the new IPC client and saved-file hash agree. Rollback refuses post-state drift, restores the sealed bytes atomically, calls native revert, and verifies the original file hash, memory hash, and revision.

Only bridge-owned processes may be closed. API tokens, raw NNG frames, arbitrary Python, shell commands, UI automation, and screen scraping are never exposed.
