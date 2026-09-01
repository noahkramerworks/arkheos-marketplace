# API admission

Godot Bridge 0.2.0 binds Godot Engine 4.7's documented `EditorPlugin`, `EditorInterface`, resource, debugger, and export APIs through the pinned Godot 4.7.1 stable Windows executable. The project-local addon is a bridge-owned authenticated loopback adapter; it is not a controller-only, UI-automation, screen-scraping, or raw-command surface.

Typed reads include project, scene, and playtest state. Typed writes include closed project transactions, playtest lifecycle, and revision-bound export. The addon returns semantic state, while the server independently hashes saved project and artifact bytes. A request completion or process exit is never sufficient proof.

`npm run test:admission` uses an isolated project and a fixed source-owned driver. It performs one real typed scene write, stops the owning editor, reads the saved scene through a separate Godot process, rolls the immutable receipt back, reads again through a new process, and proves the project revision exactly matches pre-state. No arbitrary code, method, protocol payload, shell command, or unrestricted path crosses an MCP tool boundary.

Every release binds the Godot executable and source-owned addon as control-surface artifacts in a Bridge Runtime v1.2 certificate. Drift in either artifact makes the certificate stale.
