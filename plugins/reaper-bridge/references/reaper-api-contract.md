# REAPER 7.79 native API contract

REAPER Bridge 0.2.0 is admitted through the documented REAPER C/C++ extension plug-in API, not through a control-surface interface, UI automation, screen scraping, ReaScript, raw action IDs, or command passthrough.

## Version identity

- Application: `C:\Program Files\REAPER (x64)\reaper.exe`, file version 7.79.
- Host ABI: `REAPER_PLUGIN_VERSION` `0x20E` from pinned `reaper_plugin.h`.
- Official SDK source: `justinfrankel/reaper-sdk` commit `490ded57668727fba21482fabc50ba9853a457bb`.
- Bridge extension: `reaper_codex_bridge.dll` version 0.2.0, built from the canonical source with the pinned headers.
- Native connections are admitted only when application, bridge, ABI, SDK commit, protocol, and bearer identity all match.

## Selected official functions

The extension imports only the compile-time selected REAPER API functions used by its closed operations: `EnumProjects`, `GetAppVersion`, `GetProjectStateChangeCount`, `IsProjectDirty`, `CountTracks`, `GetTrack`, `GetTrackName`, `GetMediaTrackInfo_Value`, `SetMediaTrackInfo_Value`, `GetSetMediaTrackInfo_String`, `InsertTrackAtIndex`, `TrackFX_AddByName`, `TrackFX_GetCount`, `Main_SaveProjectEx`, `Main_OnCommand`, `Undo_BeginBlock2`, `Undo_EndBlock2`, `Undo_DoUndo2`, `TrackList_AdjustWindows`, and `UpdateArrange`.

## Typed semantic boundary

Typed reads are installation identity and bounded project state. Typed writes are one revision-guarded saved-project transaction, one existing-settings master render, and receipt rollback. The nine MCP tools expose only these semantics plus owned setup and process lifecycle. The coordinator accepts only authenticated loopback reverse polls from the exact version-bound extension and never forwards caller-authored native operations.

## Independent readback and restoration

Every project mutation starts from a clean saved `.rpp`, exact native revision, and byte-hashed checkpoint. After native save, the bridge obtains a second native inspection and independently hashes the saved project. Rollback uses the native undo block first, then the sealed checkpoint when serialization is not byte-identical, and succeeds only when the saved project SHA-256 equals the original pre-state SHA-256.

## Rejected surfaces

The package rejects arbitrary ReaScript, raw RPC, raw coordinator payloads, arbitrary REAPER command IDs, unsupported operations, foreign plug-in identifiers, credentials, dirty or unsaved projects, path mismatches, stale revisions, foreign extension targets, unauthenticated connections, version drift, controller-only operation, UI automation, screen scraping, and export-only claims.
