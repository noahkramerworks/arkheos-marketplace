"""Bridge-owned QGIS 4.2 reverse-polling extension; no Bridge Runtime dependency."""

import hashlib
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

from qgis.PyQt.QtCore import QTimer
from qgis.core import (
    Qgis,
    QgsApplication,
    QgsCoordinateReferenceSystem,
    QgsLayoutExporter,
    QgsLayoutItemMap,
    QgsLayoutPoint,
    QgsLayoutSize,
    QgsLineSymbol,
    QgsPrintLayout,
    QgsProject,
    QgsRectangle,
    QgsUnitTypes,
    QgsVectorLayer,
)

PROTOCOL = "qgis-bridge/1"
BRIDGE_VERSION = "0.1.0"
APPLICATION_VERSION = "4.2.0"
API_VERSION = "PyQGIS 4.2.0 / 40200"
OWNERSHIP = "qgis-bridge/0.1.0"


def _sha_file(filename):
    digest = hashlib.sha256()
    with open(filename, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _bounded(value, limit=200):
    return str(value or "")[:limit]


def _owned_layer(layer):
    return layer.customProperty("arkheos-owner", "") == OWNERSHIP


def _layer_observation(layer):
    renderer = layer.renderer()
    symbol = renderer.symbol() if renderer and hasattr(renderer, "symbol") else None
    renderer_info = {"type": _bounded(renderer.type() if renderer else "none", 40)}
    if symbol:
        renderer_info["color"] = symbol.color().name()
        if hasattr(symbol, "width"):
            renderer_info["width"] = float(symbol.width())
    return {
        "id": _bounded(layer.id(), 120),
        "name": _bounded(layer.name(), 120),
        "provider": _bounded(layer.providerType(), 40),
        "geometryType": int(layer.geometryType()),
        "featureCount": int(layer.featureCount()),
        "owned": _owned_layer(layer),
        "renderer": renderer_info,
    }


def observe_project():
    project = QgsProject.instance()
    filename = str(Path(project.fileName()).resolve()) if project.fileName() else ""
    if not filename or not Path(filename).is_file():
        raise RuntimeError("QGIS project is not saved")
    layers = sorted((_layer_observation(layer) for layer in project.mapLayers().values()), key=lambda item: item["id"])[:128]
    layouts = sorted(_bounded(layout.name(), 80) for layout in project.layoutManager().printLayouts())[:64]
    body = {
        "project": {"path": filename, "sha256": _sha_file(filename), "title": _bounded(project.title(), 160)},
        "dirty": bool(project.isDirty()),
        "crs": _bounded(project.crs().authid(), 40),
        "layers": layers,
        "layouts": layouts,
    }
    revision = "sha256:" + hashlib.sha256(_canonical(body).encode("utf-8")).hexdigest()
    return {
        "ok": True,
        "applicationVersion": APPLICATION_VERSION,
        "applicationName": _bounded(Qgis.QGIS_VERSION, 100),
        "versionInt": int(Qgis.QGIS_VERSION_INT),
        "bridgeVersion": BRIDGE_VERSION,
        "apiVersion": API_VERSION,
        "pid": os.getpid(),
        **body,
        "revision": revision,
    }


def _require_owned_layer(project, layer_id):
    layer = project.mapLayer(layer_id)
    if layer is None or not _owned_layer(layer):
        raise RuntimeError("layer is missing or not bridge-owned")
    return layer


def _combined_extent(project):
    extent = QgsRectangle()
    for layer in project.mapLayers().values():
        candidate = layer.extent()
        if not candidate.isEmpty():
            extent.combineExtentWith(candidate)
    if extent.isEmpty():
        extent = QgsRectangle(-74.01, 40.70, -73.97, 40.74)
    return extent


def apply_transaction(payload):
    project = QgsProject.instance()
    before = observe_project()
    if before["dirty"] or before["revision"] != payload.get("expectedRevision"):
        raise RuntimeError("dirty project or stale expected revision")
    last_created = None
    for action in payload.get("actions", []):
        action_type = action.get("type")
        if action_type == "add_geojson_layer":
            layer = QgsVectorLayer(action["sourcePath"], action["name"], "ogr")
            if not layer.isValid() or int(layer.geometryType()) != 1:
                raise RuntimeError("GeoJSON must be a valid line layer")
            layer.setCustomProperty("arkheos-owner", OWNERSHIP)
            project.addMapLayer(layer)
            last_created = layer.id()
        elif action_type == "set_single_symbol":
            layer_id = last_created if action["layerId"] == "@last_created" else action["layerId"]
            layer = _require_owned_layer(project, layer_id)
            symbol = QgsLineSymbol.createSimple({"color": action["color"], "width": str(action["width"])})
            if symbol is None:
                raise RuntimeError("failed to create closed line symbol")
            layer.renderer().setSymbol(symbol)
            layer.triggerRepaint()
        elif action_type == "rename_owned_layer":
            layer_id = last_created if action["layerId"] == "@last_created" else action["layerId"]
            _require_owned_layer(project, layer_id).setName(action["name"])
        elif action_type == "ensure_layout":
            name = action["name"]
            manager = project.layoutManager()
            layout = next((item for item in manager.printLayouts() if item.name() == name), None)
            if layout is None:
                layout = QgsPrintLayout(project)
                layout.initializeDefaults()
                layout.setName(name)
                layout.setCustomProperty("arkheos-owner", OWNERSHIP)
                if not manager.addLayout(layout):
                    raise RuntimeError("failed to add bridge-owned layout")
            elif layout.customProperty("arkheos-owner", "") != OWNERSHIP:
                raise RuntimeError("layout name is occupied by a foreign layout")
            for item in list(layout.items()):
                if isinstance(item, QgsLayoutItemMap):
                    layout.removeLayoutItem(item)
            map_item = QgsLayoutItemMap(layout)
            map_item.attemptMove(QgsLayoutPoint(20, 20, QgsUnitTypes.LayoutMillimeters))
            map_item.attemptResize(QgsLayoutSize(250, 160, QgsUnitTypes.LayoutMillimeters))
            map_item.setExtent(_combined_extent(project))
            layout.addLayoutItem(map_item)
        elif action_type == "remove_owned_layer":
            layer_id = last_created if action["layerId"] == "@last_created" else action["layerId"]
            layer = _require_owned_layer(project, layer_id)
            project.removeMapLayer(layer.id())
        else:
            raise RuntimeError("unsupported semantic action")
    if not project.write():
        raise RuntimeError("QGIS failed to save the project")
    return observe_project()


def export_layout(payload):
    observed = observe_project()
    if observed["dirty"] or observed["revision"] != payload.get("expectedRevision"):
        raise RuntimeError("dirty project or stale expected revision")
    project = QgsProject.instance()
    layout = next((item for item in project.layoutManager().printLayouts() if item.name() == payload.get("layoutName")), None)
    if layout is None or layout.customProperty("arkheos-owner", "") != OWNERSHIP:
        raise RuntimeError("layout is missing or not bridge-owned")
    output = str(Path(payload["outputPath"]).resolve())
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    exporter = QgsLayoutExporter(layout)
    if payload["format"] == "png":
        settings = QgsLayoutExporter.ImageExportSettings()
        settings.dpi = 150
        code = exporter.exportToImage(output, settings)
    elif payload["format"] == "pdf":
        settings = QgsLayoutExporter.PdfExportSettings()
        code = exporter.exportToPdf(output, settings)
    else:
        raise RuntimeError("unsupported export format")
    if int(code) != int(QgsLayoutExporter.Success) or not Path(output).is_file() or Path(output).stat().st_size == 0:
        raise RuntimeError("QGIS layout export failed")
    observation = observe_project()
    return {**observation, "outputPath": output, "bytes": Path(output).stat().st_size, "sha256": _sha_file(output)}


def reload_project(payload):
    project = QgsProject.instance()
    project.clear()
    if not project.read(payload["projectPath"]):
        raise RuntimeError("QGIS failed to reload the restored project")
    return observe_project()


def dispatch(operation, payload):
    if operation == "inspect":
        return observe_project()
    if operation == "apply":
        return apply_transaction(payload)
    if operation == "export_layout":
        return export_layout(payload)
    if operation == "reload":
        return reload_project(payload)
    if operation == "shutdown":
        QTimer.singleShot(0, QgsApplication.quit)
        return {"ok": True, "stopping": True}
    raise RuntimeError("unknown native operation")


def _request(method, url, token, value=None):
    data = None if value is None else json.dumps(value).encode("utf-8")
    request = urllib.request.Request(url, data=data, method=method, headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=2) as response:
            if response.status == 204:
                return None
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        if error.code == 204:
            return None
        raise


class BridgeExtension:
    def __init__(self):
        self.endpoint = os.environ.get("ARKHEOS_QGIS_ENDPOINT", "")
        self.token = os.environ.get("ARKHEOS_QGIS_TOKEN", "")
        self.timer = QTimer()
        self.timer.setInterval(100)
        self.timer.timeout.connect(self.poll)

    def start(self):
        if not self.endpoint.startswith("http://127.0.0.1:") or len(self.token) < 32:
            raise RuntimeError("invalid bridge coordinator descriptor")
        identity = {"protocol": PROTOCOL, "pid": os.getpid(), "applicationVersion": APPLICATION_VERSION, "applicationName": Qgis.QGIS_VERSION, "versionInt": int(Qgis.QGIS_VERSION_INT), "bridgeVersion": BRIDGE_VERSION, "apiVersion": API_VERSION}
        _request("POST", self.endpoint + "/v1/connect", self.token, identity)
        self.timer.start()
        return self

    def poll(self):
        try:
            job = _request("GET", self.endpoint + "/v1/jobs/next?pid=" + str(os.getpid()), self.token)
            if not job:
                return
            try:
                result = dispatch(job["operation"], job.get("input", {}))
            except Exception as error:
                result = {"ok": False, "error": str(error)[:1000]}
            _request("POST", self.endpoint + "/v1/jobs/" + job["id"] + "/complete", self.token, result)
        except Exception:
            return


def classFactory(iface):
    class Plugin:
        def __init__(self):
            self.bridge = None
        def initGui(self):
            self.bridge = BridgeExtension().start()
        def unload(self):
            if self.bridge:
                self.bridge.timer.stop()
    return Plugin()


def _qgis_application(gui=False):
    prefix = os.environ.get("QGIS_PREFIX_PATH", "")
    if prefix:
        QgsApplication.setPrefixPath(prefix, True)
    app = QgsApplication([], gui)
    app.initQgis()
    return app


def _create_fixture(filename):
    app = _qgis_application(False)
    try:
        project = QgsProject.instance()
        project.clear()
        project.setTitle("ArkheOS QGIS Fixture")
        project.setCrs(QgsCoordinateReferenceSystem("EPSG:4326"))
        if not project.write(str(Path(filename).resolve())):
            raise RuntimeError("failed to write QGIS fixture")
    finally:
        app.exitQgis()


def _serve(filename):
    app = _qgis_application(False)
    project = QgsProject.instance()
    if not project.read(str(Path(filename).resolve())):
        raise RuntimeError("failed to load QGIS project")
    bridge = BridgeExtension().start()
    code = app.exec()
    bridge.timer.stop()
    app.exitQgis()
    return code


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--create-fixture":
        _create_fixture(sys.argv[2])
    elif len(sys.argv) == 3 and sys.argv[1] == "--serve":
        raise SystemExit(_serve(sys.argv[2]))
    else:
        raise SystemExit("closed adapter usage")
