# FreeCAD 1.1.3 API contract

The admitted application is FreeCAD 1.1.3, revision `20260725 (Git shallow)`, source identity `145529fe741292ff0b3977a01195bf0247425794`. The installed GUI and command-line binaries are `C:\Program Files\FreeCAD 1.1\bin\FreeCAD.exe` and `C:\Program Files\FreeCAD 1.1\bin\FreeCADCmd.exe`.

The official version-bound control surface is FreeCAD's documented Python/library API hosted in the GUI process and `FreeCADCmd.exe`. The bridge uses `App.Version`, `App.ActiveDocument`, `App.openDocument`, `App.closeDocument`, `Document.Objects`, `Document.addObject`, `Document.removeObject`, `Document.openTransaction`, `Document.commitTransaction`, `Document.abortTransaction`, `Document.recompute`, `Document.save`, `Part.export`, and `Mesh.export`.

Live reads and writes run only through the bridge-owned authenticated reverse-polling GUI extension. Batch export invokes only the profile-bound `FreeCADCmd.exe`, the source-owned `batch.py`, and a closed bridge-authored JSON job. No tool accepts Python, macros, shell, command identifiers, module names, generic properties, or raw protocol payloads.

The admitted action union is `create_box`, `create_cylinder`, `set_dimension`, `rename_owned_feature`, and `remove_owned_feature`. Objects must carry `ArkheOSOwner == "freecad-bridge"` before any action other than creation. Dimension properties are closed by object type. State readback re-queries objects, recomputed shape volume/bounds, document revision, dirty state, and saved file SHA-256. Rollback restores the sealed pre-state `.FCStd` and reloads it before comparison.
