# REAPER Bridge contributor contract

- Canonical source is `C:\Users\rizek\plugins\reaper-bridge`; `design/plugin.md` is the accepted design authority.
- This package is free Apache-2.0 bridge infrastructure released to both `reaper-bridge@personal` and `reaper-bridge@arkheos`.
- Durable state is beneath `%CODEX_HOME%\state\plugins\reaper-bridge\v1`; use the rollback Skill and `references/recovery.md` for recovery.
- REAPER is authoritative for project, track, FX, render, undo, and dirty state.
- Keep every mutation revision-guarded, saved-project-only, checkpointed, read back natively, and sealed in an immutable receipt.
- Never expose, copy, parse, or persist REAPER license contents; report only registered/unregistered observations.
- Do not add arbitrary ReaScript, command IDs, RPC, filesystem paths, FX, or transaction actions.
- Bridge Runtime is a build/certification authority, never a runtime dependency; retain `reaper-extension/TEMPLATE-PROVENANCE.json` and the pinned official SDK provenance.
- Preserve the `bridge-profile/v1.2` API gate: official version-bound API, typed reads and writes, independent state readback, exact rollback, and explicit rejection of controller-only, UI automation, screen scraping, raw passthrough, and export-only surfaces.
- Update accepted design before changing public tools, Skills, authority, persistence, transport, or lifecycle.
- Run `npm test`, `npm run test:admission`, the real native canary, Codex Runtime hardened audit, Bridge Runtime v1.2 certification, and dual-target promotion before installation/update.
- Verify six Skills and nine tools from a genuinely fresh task after every release.
