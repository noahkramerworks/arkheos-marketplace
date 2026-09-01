# Security and state

Loopback requests require an exact bearer token. Runtime discovery expires after 24 hours. Request bodies are capped at 2 MiB and jobs at 32 actions. Durable state uses atomic writes beneath `%CODEX_HOME%\state\plugins\reaper-bridge\v1`; receipts are content-addressed and immutable. Project checkpoints remain outside project directories.

The bridge never reads `reaper-license.rk`, email, credentials, audio inputs, or arbitrary files. It hashes only admitted executables, extension artifacts, saved projects, renders, checkpoints, and its own state.

