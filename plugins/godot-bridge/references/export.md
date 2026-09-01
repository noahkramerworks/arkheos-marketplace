# Export contract

`inspect_export` is read-only. It binds an enrolled project, the enrollment's exact engine, source-owned `export_presets.cfg`, installed template directory, selected release template, target platform and architecture, embedded-PCK state, and current project revision. Missing or malformed preset data and template state are explicit blockers.

`build_export` admits only a named `Windows Desktop` release preset that explicitly sets `binary_format/architecture="x86_64"` and `binary_format/embed_pck=true`. Inputs are the exact revision returned by inspection, an existing absolute external output directory, and a safe extension-free basename. The output directory cannot be the project or a descendant, traverse a symlink or reparse point, or contain the final artifact already.

The bridge exports to a unique owned staging directory, captures at most 64 KiB from each process stream while retaining total-byte and truncation evidence, and enforces a five-minute timeout. A successful operation requires exit code zero, exactly one expected staged file, Windows PE identity, stable project and preset hashes, an atomic collision-free publication, identical staged and final hashes, staging cleanup, and an immutable `godot-bridge/export-receipt/v1` record.

Failure removes only the exact bridge-owned staging directory. If receipt sealing or final verification fails after publication, the bridge removes the final file only while its bytes still match the operation's own published hash. It never overwrites an existing artifact and never changes project source as part of publication.

