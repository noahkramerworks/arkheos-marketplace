"""Authenticated, closed FreeCAD 1.1.3 reverse-polling bridge extension."""

import hashlib
import json
import os
import urllib.error
import urllib.request

import FreeCAD as App
from PySide import QtCore

PROTOCOL = "freecad-bridge/1"
BRIDGE_VERSION = "0.1.0"
API_VERSION = "FreeCAD Python API 1.1.3"
OWNER = "freecad-bridge"
_timer = None
_connected = None
_last_error = None


def _log(message):
    try:
        filename = os.path.join(os.path.dirname(_state_file()), "extension.log")
        os.makedirs(os.path.dirname(filename), exist_ok=True)
        with open(filename, "a", encoding="utf-8") as stream:
            stream.write(str(message).replace("\n", " ")[:1000] + "\n")
    except Exception:
        pass


def _state_file():
    root = os.environ.get("CODEX_HOME") or os.path.join(os.path.expanduser("~"), ".codex")
    return os.path.join(root, "state", "plugins", "freecad-bridge", "v1", "runtime", "current.json")


def _runtime():
    with open(_state_file(), "r", encoding="utf-8") as stream:
        value = json.load(stream)
    if value.get("protocol") != PROTOCOL or not str(value.get("endpoint", "")).startswith("http://127.0.0.1:") or not value.get("token"):
        raise RuntimeError("invalid coordinator descriptor")
    return value


def _request(method, route, payload=None):
    runtime = _runtime()
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(runtime["endpoint"] + route, data=data, method=method)
    request.add_header("Authorization", "Bearer " + runtime["token"])
    if data is not None:
        request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request, timeout=2) as response:
        raw = response.read()
        return response.status, (json.loads(raw.decode("utf-8")) if raw else None)


def _version():
    value = App.Version()
    return {
        "protocol": PROTOCOL,
        "pid": os.getpid(),
        "applicationVersion": ".".join(value[:3]),
        "bridgeVersion": BRIDGE_VERSION,
        "apiVersion": API_VERSION,
        "buildRevision": value[3],
        "sourceIdentity": value[7] if len(value) > 7 else "",
    }


def _sha_file(filename):
    if not filename or not os.path.isfile(filename):
        return None
    digest = hashlib.sha256()
    with open(filename, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _quantity(value):
    try:
        return float(value.Value)
    except Exception:
        return float(value)


def _feature(obj):
    owned = hasattr(obj, "ArkheOSOwner") and obj.ArkheOSOwner == OWNER
    result = {"name": obj.Name, "label": obj.Label, "typeId": obj.TypeId, "owned": owned}
    dimensions = {}
    for prop in ("Length", "Width", "Height", "Radius", "Angle"):
        if hasattr(obj, prop):
            dimensions[prop] = _quantity(getattr(obj, prop))
    if dimensions:
        result["dimensions"] = dimensions
    if hasattr(obj, "Shape") and not obj.Shape.isNull():
        box = obj.Shape.BoundBox
        result["shape"] = {"volume": float(obj.Shape.Volume), "bounds": [float(box.XMin), float(box.YMin), float(box.ZMin), float(box.XMax), float(box.YMax), float(box.ZMax)]}
    return result


def _inspect():
    identity = _version()
    doc = App.ActiveDocument
    if doc is None:
        state = {**identity, "document": None, "dirty": False, "features": []}
    else:
        filename = os.path.abspath(doc.FileName) if doc.FileName else None
        features = [_feature(obj) for obj in doc.Objects[:256]]
        state = {**identity, "document": {"name": doc.Name, "label": doc.Label, "path": filename, "sha256": _sha_file(filename)}, "dirty": bool(doc.isTouched()), "features": features}
    canonical = json.dumps(state, sort_keys=True, separators=(",", ":")).encode("utf-8")
    state["revision"] = "sha256:" + hashlib.sha256(canonical).hexdigest()
    return {"ok": True, **state}


def _owned(doc, name):
    obj = doc.getObject(name)
    if obj is None or not hasattr(obj, "ArkheOSOwner") or obj.ArkheOSOwner != OWNER:
        raise RuntimeError("feature is not bridge-owned")
    return obj


def _apply_action(doc, action):
    kind = action["type"]
    if kind == "create_box":
        obj = doc.addObject("Part::Box", action["name"])
        obj.addProperty("App::PropertyString", "ArkheOSOwner", "ArkheOS")
        obj.ArkheOSOwner = OWNER
        obj.Label = "ArkheOS: " + action["name"]
        obj.Length, obj.Width, obj.Height = action["length"], action["width"], action["height"]
    elif kind == "create_cylinder":
        obj = doc.addObject("Part::Cylinder", action["name"])
        obj.addProperty("App::PropertyString", "ArkheOSOwner", "ArkheOS")
        obj.ArkheOSOwner = OWNER
        obj.Label = "ArkheOS: " + action["name"]
        obj.Radius, obj.Height = action["radius"], action["height"]
    elif kind == "set_dimension":
        obj = _owned(doc, action["objectName"])
        allowed = {"Part::Box": {"Length", "Width", "Height"}, "Part::Cylinder": {"Radius", "Height", "Angle"}}
        if action["property"] not in allowed.get(obj.TypeId, set()):
            raise RuntimeError("dimension is not admitted for this feature type")
        setattr(obj, action["property"], action["value"])
    elif kind == "rename_owned_feature":
        _owned(doc, action["objectName"]).Label = action["label"]
    elif kind == "remove_owned_feature":
        obj = _owned(doc, action["objectName"])
        doc.removeObject(obj.Name)
    else:
        raise RuntimeError("unsupported action")


def _apply(value):
    before = _inspect()
    doc = App.ActiveDocument
    if doc is None or not doc.FileName or before["dirty"]:
        raise RuntimeError("a clean saved document is required")
    if before["revision"] != value.get("expectedRevision"):
        raise RuntimeError("stale document revision")
    doc.openTransaction("ArkheOS Bridge transaction")
    try:
        for action in value.get("actions", []):
            _apply_action(doc, action)
        doc.recompute()
        doc.commitTransaction()
        doc.save()
    except Exception:
        doc.abortTransaction()
        raise
    return _inspect()


def _reload(value):
    filename = os.path.abspath(value["documentPath"])
    doc = App.ActiveDocument
    if doc is not None:
        App.closeDocument(doc.Name)
    App.openDocument(filename)
    return _inspect()


def _execute(job):
    operation = job.get("operation")
    if operation == "inspect":
        return _inspect()
    if operation == "apply":
        return _apply(job.get("input") or {})
    if operation == "reload":
        return _reload(job.get("input") or {})
    raise RuntimeError("unsupported operation")


def _poll():
    global _connected, _last_error
    try:
        runtime = _runtime()
        marker = (runtime["endpoint"], runtime["token"])
        if marker != _connected:
            _request("POST", "/v1/connect", _version())
            _connected = marker
        status, job = _request("GET", "/v1/jobs/next?pid=" + str(os.getpid()))
        if status == 200 and job:
            try:
                result = _execute(job)
            except Exception as error:
                result = {"ok": False, "error": str(error)[:1000]}
            _request("POST", "/v1/jobs/" + job["requestId"] + "/complete", result)
        _last_error = None
    except Exception as error:
        _connected = None
        current = type(error).__name__ + ": " + str(error)
        if current != _last_error:
            _last_error = current
            _log(current)


def start_bridge():
    global _timer
    if _timer is not None:
        return
    _log("FreeCAD Bridge extension started")
    _timer = QtCore.QTimer()
    _timer.timeout.connect(_poll)
    _timer.start(200)


def register_bridge_timer(schedule, poll):
    return schedule(poll, first_interval=0.1, persistent=True)
