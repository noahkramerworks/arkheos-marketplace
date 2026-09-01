# Godot Bridge

Native, reversible Godot editor, playtest, and verified export control for Codex.

Godot Bridge 0.2.0 is free infrastructure certified against Godot Engine 4.7's documented editor API. Install it from `godot-bridge@personal` or the public `godot-bridge@arkheos` selector after Bridge Runtime promotion.

The plugin contributes seven focused Skills and one bundled stdio MCP server with fourteen tools for installation inspection, project enrollment, editor lifecycle, revision-guarded transactions, playtests, viewport capture, revision-bound Windows exports, and receipt rollback.

Godot remains authoritative. The project-local addon reverse-polls an authenticated loopback coordinator and executes admitted editor operations. Export inspection and building remain server-side. Durable enrollment records, checkpoints, transaction receipts, and export receipts live beneath `$CODEX_HOME/state/plugins/godot-bridge/v1`.

Scene writes are editor-coordinated: non-scene transactions never repack an unchanged open scene, while real scene writes and checkpoint restoration close clean targets before disk replacement and reopen them after verified readback. Dirty scene tabs fail closed.

This is a reusable bridge, not a game or Game Studio product. Read `references/api-admission.md` for the enforced API boundary and `design/plugin.md` for the accepted package and lifecycle contract.
