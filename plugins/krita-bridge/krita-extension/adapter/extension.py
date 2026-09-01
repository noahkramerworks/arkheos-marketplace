"""Bridge-owned Krita 5.3.3 reverse-polling PyKrita extension."""

import hashlib
import json
import os
from pathlib import Path
import urllib.error
import urllib.request

try:
    from PyQt6.QtCore import QByteArray, QCoreApplication, QTimer
except ImportError:
    from PyQt5.QtCore import QByteArray, QCoreApplication, QTimer

from krita import Extension, Krita

PROTOCOL = "krita-bridge/1"
BRIDGE_VERSION = "0.1.0"
APPLICATION_VERSION = "5.3.3"
API_VERSION = "PyKrita 5.3.3"
VERSION_INT = 50303
OWNERSHIP_LABEL = 8
OWNERSHIP_PREFIX = "ArkheOS_"


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


def _node_id(node):
    return str(node.uniqueId()).strip("{}")


def _owned(node):
    return node.name().startswith(OWNERSHIP_PREFIX) and int(node.colorLabel()) == OWNERSHIP_LABEL


def _node_observation(node, depth=0):
    position = node.position()
    return {
        "id": _bounded(_node_id(node), 64),
        "name": _bounded(node.name(), 96),
        "type": _bounded(node.type(), 40),
        "visible": bool(node.visible()),
        "opacity": int(node.opacity()),
        "position": {"x": int(position.x()), "y": int(position.y())},
        "colorLabel": int(node.colorLabel()),
        "owned": _owned(node),
        "depth": int(depth),
    }


def _walk_nodes(parent, depth=0, output=None):
    output = output if output is not None else []
    for node in parent.childNodes():
        if len(output) >= 128:
            break
        output.append(_node_observation(node, depth))
        _walk_nodes(node, depth + 1, output)
    return output


def _semantic_layers(layers):
    return [{key: value for key, value in layer.items() if key != "id"} for layer in layers]


def observe_document():
    app = Krita.instance()
    document = app.activeDocument()
    if document is None:
        raise RuntimeError("Krita has no active document")
    document.waitForDone()
    filename = str(Path(document.fileName()).resolve()) if document.fileName() else ""
    if not filename or not Path(filename).is_file():
        raise RuntimeError("Krita document is not saved")
    layers = _walk_nodes(document.rootNode())
    body = {
        "document": {
            "path": filename,
            "sha256": _sha_file(filename),
            "name": _bounded(document.name(), 160),
            "width": int(document.width()),
            "height": int(document.height()),
            "colorModel": _bounded(document.colorModel(), 40),
            "colorDepth": _bounded(document.colorDepth(), 40),
            "colorProfile": _bounded(document.colorProfile(), 120),
        },
        "dirty": bool(document.modified()),
        "layers": layers,
    }
    revision_body = {**body, "layers": _semantic_layers(layers)}
    revision = "sha256:" + hashlib.sha256(_canonical(revision_body).encode("utf-8")).hexdigest()
    return {
        "ok": True,
        "applicationVersion": APPLICATION_VERSION,
        "applicationName": _bounded(app.version(), 80),
        "versionInt": VERSION_INT,
        "bridgeVersion": BRIDGE_VERSION,
        "apiVersion": API_VERSION,
        "pid": os.getpid(),
        **body,
        "revision": revision,
    }


def _find_node(document, node_id):
    normalized = str(node_id).strip("{}")
    stack = list(document.rootNode().childNodes())
    while stack:
        node = stack.pop()
        if _node_id(node) == normalized:
            return node
        stack.extend(node.childNodes())
    return None


def _require_owned(document, node_id):
    node = _find_node(document, node_id)
    if node is None or not _owned(node) or node.type() != "paintlayer":
        raise RuntimeError("layer is missing, foreign, or not a paint layer")
    return node


def _show_document(app, document):
    app.setActiveDocument(document)
    window = app.activeWindow()
    if window is not None and all(view.document() != document for view in window.views()):
        window.addView(document)
    app.setActiveDocument(document)


def _paint_proof(document, node):
    width = min(96, int(document.width()))
    height = min(96, int(document.height()))
    x = max(0, (int(document.width()) - width) // 2)
    y = max(0, (int(document.height()) - height) // 2)
    pixels = bytearray()
    for row in range(height):
        for column in range(width):
            edge = row < 5 or column < 5 or row >= height - 5 or column >= width - 5
            pixels.extend((20, 20, 20, 255) if edge else (42, 255, 190, 255))
    if not node.setPixelData(QByteArray(bytes(pixels)), x, y, width, height):
        raise RuntimeError("Krita rejected deterministic paint-layer pixels")


def apply_transaction(payload):
    document = Krita.instance().activeDocument()
    before = observe_document()
    if before["dirty"] or before["revision"] != payload.get("expectedRevision"):
        raise RuntimeError("dirty document or stale expected revision")
    last_created = None
    for action in payload.get("actions", []):
        action_type = action.get("type")
        if action_type == "create_paint_layer":
            node = document.createNode(action["name"], "paintlayer")
            if node is None:
                raise RuntimeError("Krita failed to create a paint layer")
            node.setColorLabel(OWNERSHIP_LABEL)
            if not document.rootNode().addChildNode(node, None):
                raise RuntimeError("Krita failed to attach the paint layer")
            _paint_proof(document, node)
            last_created = _node_id(node)
        elif action_type == "rename_owned_layer":
            layer_id = last_created if action["layerId"] == "@last_created" else action["layerId"]
            _require_owned(document, layer_id).setName(action["name"])
        elif action_type == "set_opacity":
            layer_id = last_created if action["layerId"] == "@last_created" else action["layerId"]
            _require_owned(document, layer_id).setOpacity(int(action["opacity"]))
        elif action_type == "set_visibility":
            layer_id = last_created if action["layerId"] == "@last_created" else action["layerId"]
            _require_owned(document, layer_id).setVisible(bool(action["visible"]))
        elif action_type == "translate_owned_layer":
            layer_id = last_created if action["layerId"] == "@last_created" else action["layerId"]
            node = _require_owned(document, layer_id)
            position = node.position()
            node.move(int(position.x()) + int(action["dx"]), int(position.y()) + int(action["dy"]))
        else:
            raise RuntimeError("unsupported semantic action")
    document.refreshProjection()
    document.waitForDone()
    if not document.save():
        raise RuntimeError("Krita failed to save the document")
    document.waitForDone()
    return observe_document()


def export_png(payload):
    observed = observe_document()
    if observed["dirty"] or observed["revision"] != payload.get("expectedRevision"):
        raise RuntimeError("dirty document or stale expected revision")
    output = str(Path(payload["outputPath"]).resolve())
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    document = Krita.instance().activeDocument()
    document.waitForDone()
    image = document.projection(0, 0, int(document.width()), int(document.height()))
    if image.isNull() or not image.save(output, "PNG"):
        raise RuntimeError("Krita projection PNG export failed")
    if not Path(output).is_file() or Path(output).stat().st_size == 0:
        raise RuntimeError("Krita did not produce a non-empty PNG")
    return {**observe_document(), "outputPath": output, "bytes": Path(output).stat().st_size, "sha256": _sha_file(output)}


def reload_document(payload):
    app = Krita.instance()
    current = app.activeDocument()
    if current is not None:
        if current.modified():
            raise RuntimeError("refusing to close a dirty document during rollback")
        current.close()
    document = app.openDocument(str(Path(payload["documentPath"]).resolve()))
    if document is None:
        raise RuntimeError("Krita failed to reopen the restored document")
    _show_document(app, document)
    document.waitForDone()
    return observe_document()


def create_fixture(payload):
    app = Krita.instance()
    output = str(Path(payload["outputPath"]).resolve())
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    current = app.activeDocument()
    if current is not None:
        current.close()
    document = app.createDocument(320, 200, "ArkheOS Krita Fixture", "RGBA", "U8", "", 120.0)
    if document is None:
        raise RuntimeError("Krita failed to create the fixture document")
    base = document.createNode("Fixture Background", "paintlayer")
    if base is None or not document.rootNode().addChildNode(base, None):
        raise RuntimeError("Krita failed to create the fixture layer")
    background = QByteArray(bytes((28, 28, 28, 255)) * (320 * 200))
    if not base.setPixelData(background, 0, 0, 320, 200):
        raise RuntimeError("Krita failed to paint the fixture")
    _show_document(app, document)
    document.refreshProjection()
    document.waitForDone()
    if not document.saveAs(output):
        raise RuntimeError("Krita failed to save the fixture")
    document.waitForDone()
    return observe_document()


def dispatch(operation, payload):
    if operation == "inspect":
        return observe_document()
    if operation == "apply":
        return apply_transaction(payload)
    if operation == "export_png":
        return export_png(payload)
    if operation == "reload":
        return reload_document(payload)
    if operation == "create_fixture":
        return create_fixture(payload)
    if operation == "shutdown":
        QTimer.singleShot(0, QCoreApplication.quit)
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


class ArkheOSKritaBridgeExtension(Extension):
    def __init__(self, parent):
        super().__init__(parent)
        self.endpoint = os.environ.get("ARKHEOS_KRITA_ENDPOINT", "")
        self.token = os.environ.get("ARKHEOS_KRITA_TOKEN", "")
        self.timer = None

    def setup(self):
        if not self.endpoint.startswith("http://127.0.0.1:") or len(self.token) < 32:
            return
        self.timer = QTimer(self)
        self.timer.setInterval(100)
        self.timer.timeout.connect(self.poll)
        identity = {"protocol": PROTOCOL, "pid": os.getpid(), "applicationVersion": APPLICATION_VERSION, "applicationName": Krita.instance().version(), "versionInt": VERSION_INT, "bridgeVersion": BRIDGE_VERSION, "apiVersion": API_VERSION}
        _request("POST", self.endpoint + "/v1/connect", self.token, identity)
        self.timer.start()

    def createActions(self, window):
        return

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
