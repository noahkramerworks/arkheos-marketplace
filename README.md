# ArkheOS — Codex, inside your tools

Eight free, source-visible application bridges with typed native operations, independent readback, immutable receipts, and exact rollback. Every release below passed Bridge Runtime 0.2.0 certification.

## Add the marketplace

```text
codex plugin marketplace add noahkramerworks/arkheos-marketplace --ref main
```

## Free bridge catalog

| Bridge | Bound application surface | Outcome | Install | License |
|---|---|---|---|---|
| Blender 0.3.0 | Blender 5.2.1 Python API | Inspect, author pose actions, edit, render, export, and undo a scene transaction. | `codex plugin add blender-bridge@arkheos` | GPL-3.0-or-later |
| Godot 0.2.0 | Godot 4.7 editor API | Inspect, edit, playtest, export, and restore a project revision. | `codex plugin add godot-bridge@arkheos` | Apache-2.0 |
| OBS 0.2.1 | OBS 32.2.1 WebSocket protocol | Inspect, apply, verify, and undo a studio scene plan. | `codex plugin add obs-bridge@arkheos` | Apache-2.0 |
| REAPER 0.2.0 | REAPER 7.79 native extension | Inspect, edit, render, and restore a saved project. | `codex plugin add reaper-bridge@arkheos` | Apache-2.0 |
| KiCad 0.1.0 | KiCad 10.0.5 IPC API | Inspect, change, render, and exactly restore a PCB. | `codex plugin add kicad-bridge@arkheos` | Apache-2.0 |
| QGIS 0.1.1 | QGIS 4.2.0 PyQGIS API | Add and style a layer, render a layout, and restore the project. | `codex plugin add qgis-bridge@arkheos` | GPL-3.0-or-later |
| FreeCAD 0.1.0 | FreeCAD 1.1.3 Python/library API | Change a parametric feature, export STEP/STL, and restore it. | `codex plugin add freecad-bridge@arkheos` | Apache-2.0 |
| Krita 0.1.0 | Krita 5.3.3 PyKrita API | Create and transform a layer, export PNG, and restore the document. | `codex plugin add krita-bridge@arkheos` | GPL-3.0-or-later |

## Inspect → Change → Verify → Undo

Bridge tools expose closed semantic actions rather than arbitrary code, shell commands, raw protocol payloads, or unrestricted paths. Certification binds the application/API identity, clean source revision, native canary, independent state readback, and exact restoration proof.

## Stream Showrunner

Stream Showrunner is the first paid product built on the free OBS Bridge. Start with the unchanged one-time seven-day no-card trial. ArkheOS membership remains $10/month or $99/year.

```text
codex plugin add arkheos@arkheos
```

Then tell Codex: `@ArkheOS authorize my account, start my trial, and install Stream Showrunner`.

Paid product archives remain outside this repository and are delivered through `api.arkheos.ai` after entitlement verification. Visit [arkheos.ai](https://arkheos.ai/) or email [support@arkheos.ai](mailto:support@arkheos.ai).
