# REAPER Bridge

REAPER Bridge 0.2.0 is a free source-owned Codex plugin for REAPER 7.79 on Windows x64, released as `reaper-bridge@personal` and `reaper-bridge@arkheos`. A native extension uses the pinned official REAPER C/C++ extension API and reverse-polls an authenticated ephemeral loopback coordinator. REAPER remains the authority; the plugin provides setup, version-bound inspection, revision-guarded edits, render admission, immutable receipts, independent saved-project readback, and exact rollback.

Canonical source: `C:\Users\rizek\plugins\reaper-bridge`  
State: `%CODEX_HOME%\state\plugins\reaper-bridge\v1`  
Extension: `%APPDATA%\REAPER\UserPlugins\reaper_codex_bridge.dll`

Build with `npm run build:native`, run `npm test`, `npm run test:admission`, and `npm run test:live`, then certify and promote through Bridge Runtime 0.2.0. The package is Apache-2.0, contains no REAPER license material, and includes no product-specific DAW workflow.


Read `design/plugin.md` for the accepted package contract and `references/reaper-api-contract.md` for the exact admitted native API boundary.
