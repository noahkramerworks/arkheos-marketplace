# QGIS 4.2.0 API contract

The bridge is bound to QGIS 4.2.0-Belém do Pará (`QGIS_VERSION_INT == 40200`) and the installed PyQGIS application API. The reverse-polling extension uses `QgsProject` for active project identity, dirtiness, CRS, layer tree, save, clear, and reload; `QgsVectorLayer` and closed symbol factories for admitted layer/style changes; `QgsPrintLayout`, `QgsLayoutItemMap`, and `QgsLayoutExporter` for the owned layout and PNG/PDF output. Each poll response reports exact application, API, bridge, process, and project identity.

No tool exposes Python, Processing expressions, SQL, provider strings, URI construction, arbitrary renderer properties, raw Qt actions, protocol payloads, or generic file access. Export is a typed layout operation, not a general Processing or command surface. Independent readback is a new inspection job after native save. Applied rollback restores checkpoint bytes, reloads the project through `QgsProject.read`, and verifies the original project digest and revision.

