"""Fixed KiCad 10.0.5 IPC client. No generic code, command, or raw payload surface."""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path

from kipy import KiCad
from kipy.board_types import BoardLayer, BoardText
from kipy.geometry import Vector2
from kipy.util.units import from_mm, to_mm

EXPECTED_VERSION = (10, 0, 5)
OWNED_PREFIX = "ARKHEOS_BRIDGE:"
ALLOWED_OPERATIONS = {"status", "inspect", "apply", "revert"}
ALLOWED_LAYERS = {"Cmts.User": BoardLayer.BL_Cmts_User, "Dwgs.User": BoardLayer.BL_Dwgs_User}
ACTION_FIELDS = {
    "create_text": {"type", "value", "xMm", "yMm", "layer"},
    "move_owned_text": {"type", "textId", "dxMm", "dyMm"},
    "set_title": {"type", "title"},
    "delete_owned_text": {"type", "textId"},
}
UUID_PATTERN = re.compile(r"^[0-9a-fA-F-]{36}$")


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def normalize_document(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n").rstrip() + "\n"


def canonical(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def exact_path(value: str) -> str:
    if not isinstance(value, str) or not re.match(r"^[A-Za-z]:\\", value) or not value.lower().endswith(".kicad_pcb"):
        raise ValueError("boardPath must be an absolute Windows .kicad_pcb path")
    resolved = str(Path(value).resolve())
    if not Path(resolved).is_file():
        raise ValueError("boardPath does not exist")
    return resolved


def connect(socket_path: str):
    if not isinstance(socket_path, str) or not socket_path.startswith("ipc://") or len(socket_path) > 1024:
        raise ValueError("socketPath is not an admitted KiCad IPC socket")
    client = KiCad(socket_path=socket_path, client_name="arkheos-kicad-bridge-0.1.0", timeout_ms=5000)
    version = client.get_version()
    if (version.major, version.minor, version.patch) != EXPECTED_VERSION:
        raise ValueError(f"KiCad version drift: expected 10.0.5, observed {version.full_version}")
    return client, version


def item_id(item) -> str:
    return str(item.id.value)


def board_for(client, requested_path: str):
    board = client.get_board()
    native_name = Path(board.name).name
    if native_name.lower() != Path(requested_path).name.lower():
        raise ValueError(f"Open board drift: expected {Path(requested_path).name}, observed {native_name}")
    return board


def observe(client, version, requested_path: str):
    board_path = exact_path(requested_path)
    board = board_for(client, board_path)
    disk_bytes = Path(board_path).read_bytes()
    disk_text = disk_bytes.decode("utf-8-sig")
    memory_text = board.get_as_string()
    disk_normalized = normalize_document(disk_text)
    memory_normalized = normalize_document(memory_text)
    disk_normalized_sha = sha256(disk_normalized.encode("utf-8"))
    memory_sha = sha256(memory_normalized.encode("utf-8"))
    serialization_matches_disk = disk_normalized_sha == memory_sha

    title = board.get_title_block_info().title
    layers = []
    for layer in board.get_enabled_layers()[:128]:
        layers.append({"id": int(layer), "name": board.get_layer_name(layer)})

    texts = []
    for text in board.get_text()[:256]:
        entry = {"id": item_id(text), "kind": type(text).__name__, "value": str(text.value)[:256], "owned": str(text.value).startswith(OWNED_PREFIX)}
        if isinstance(text, BoardText):
            entry.update({"xMm": round(to_mm(text.position.x), 6), "yMm": round(to_mm(text.position.y), 6), "layer": board.get_layer_name(text.layer)})
        texts.append(entry)

    footprints = []
    for footprint in board.get_footprints()[:256]:
        footprints.append({"id": item_id(footprint), "reference": str(getattr(footprint, "reference", ""))[:80]})
    tracks = board.get_tracks()
    vias = board.get_vias()
    selection = [item_id(item) for item in board.get_selection()[:256] if hasattr(item, "id")]
    api_version = client.get_api_version().full_version
    core = {
        "applicationVersion": version.full_version,
        "apiVersion": api_version,
        "boardPath": os.path.normcase(board_path),
        "savedSha256": sha256(disk_bytes),
        "memorySha256": memory_sha,
        "title": title,
        "layers": layers,
        "counts": {"footprints": len(footprints), "tracks": len(tracks), "vias": len(vias), "texts": len(texts)},
        "texts": texts,
        "selection": selection,
    }
    revision = "sha256:" + sha256(canonical(core).encode("utf-8"))
    return {
        "ok": True,
        "application": {"name": "KiCad PCB Editor", "version": version.full_version, "apiVersion": api_version},
        "board": {"path": board_path, "sha256": sha256(disk_bytes), "memorySha256": memory_sha, "normalizedDiskSha256": disk_normalized_sha},
        "serializationMatchesDisk": serialization_matches_disk,
        "revision": revision,
        "title": title,
        "layers": layers,
        "counts": core["counts"],
        "footprints": footprints,
        "texts": texts,
        "selection": selection,
    }


def validate_actions(actions):
    if not isinstance(actions, list) or not 1 <= len(actions) <= 32:
        raise ValueError("actions must contain 1..32 closed actions")
    for action in actions:
        if not isinstance(action, dict) or action.get("type") not in ACTION_FIELDS:
            raise ValueError("unsupported transaction action")
        if set(action) != ACTION_FIELDS[action["type"]]:
            raise ValueError("forbidden or missing action fields")
        kind = action["type"]
        if kind == "create_text":
            if not re.fullmatch(r"ARKHEOS_BRIDGE:[A-Za-z0-9 _-]{1,64}", action["value"]): raise ValueError("text is not bridge-owned")
            if action["layer"] not in ALLOWED_LAYERS: raise ValueError("unsupported text layer")
            for key in ("xMm", "yMm"):
                if not isinstance(action[key], (int, float)) or isinstance(action[key], bool) or not -1000 <= action[key] <= 1000: raise ValueError("text coordinate is out of range")
        elif kind == "move_owned_text":
            if action["textId"] != "@last_created" and not UUID_PATTERN.fullmatch(action["textId"]): raise ValueError("invalid text ID")
            for key in ("dxMm", "dyMm"):
                if not isinstance(action[key], (int, float)) or isinstance(action[key], bool) or not -250 <= action[key] <= 250: raise ValueError("text delta is out of range")
        elif kind == "set_title":
            if not isinstance(action["title"], str) or not re.fullmatch(r"[A-Za-z0-9 ._()/-]{1,96}", action["title"]): raise ValueError("title is not admitted")
        elif not UUID_PATTERN.fullmatch(action["textId"]):
            raise ValueError("invalid text ID")


def apply_actions(client, version, board_path: str, actions):
    validate_actions(actions)
    observe(client, version, board_path)
    board = board_for(client, board_path)
    commit = board.begin_commit()
    last_created = None
    created = {}
    pending_text = None

    def flush_pending():
        nonlocal pending_text, last_created
        if pending_text is None:
            return
        native = board.create_items(pending_text)[0]
        last_created = item_id(native)
        created[last_created] = native
        pending_text = None

    try:
        for action in actions:
            kind = action["type"]
            if kind == "create_text":
                flush_pending()
                text = BoardText()
                text.value = action["value"]
                text.position = Vector2.from_xy_mm(action["xMm"], action["yMm"])
                text.layer = ALLOWED_LAYERS[action["layer"]]
                text.attributes.size = Vector2.from_xy_mm(1.5, 1.5)
                text.attributes.stroke_width = from_mm(0.25)
                pending_text = text
            elif kind == "move_owned_text":
                if action["textId"] == "@last_created" and pending_text is not None:
                    pending_text.position = pending_text.position + Vector2.from_xy_mm(action["dxMm"], action["dyMm"])
                    continue
                target_id = last_created if action["textId"] == "@last_created" else action["textId"]
                if not target_id: raise ValueError("@last_created has no created text")
                target = created.get(target_id)
                if target is None:
                    target = next((item for item in board.get_text() if isinstance(item, BoardText) and item_id(item) == target_id), None)
                if target is None or not target.value.startswith(OWNED_PREFIX): raise ValueError("text is not bridge-owned")
                target.position = target.position + Vector2.from_xy_mm(action["dxMm"], action["dyMm"])
                target = board.update_items(target)[0]
                created[target_id] = target
            elif kind == "set_title":
                title_block = board.get_title_block_info()
                title_block.title = action["title"]
                board.set_title_block_info(title_block)
            elif kind == "delete_owned_text":
                target = next((item for item in board.get_text() if isinstance(item, BoardText) and item_id(item) == action["textId"]), None)
                if target is None or not target.value.startswith(OWNED_PREFIX): raise ValueError("text is not bridge-owned")
                board.remove_items(target)
        flush_pending()
        board.push_commit(commit, "ArkheOS KiCad Bridge transaction")
    except Exception:
        try: board.drop_commit(commit)
        except Exception: pass
        raise
    board.save()
    result = observe(client, version, board_path)
    result["createdTextIds"] = sorted(created)
    return result


def main():
    request = json.load(sys.stdin)
    operation = request.get("operation")
    if operation not in ALLOWED_OPERATIONS or set(request) - {"operation", "socketPath", "boardPath", "actions"}:
        raise ValueError("unsupported fixed client request")
    client, version = connect(request.get("socketPath"))
    if operation == "status":
        print(canonical({"ok": True, "application": {"name": "KiCad PCB Editor", "version": version.full_version, "apiVersion": client.get_api_version().full_version}}))
        return
    board_path = exact_path(request.get("boardPath"))
    if operation == "inspect": result = observe(client, version, board_path)
    elif operation == "apply": result = apply_actions(client, version, board_path, request.get("actions"))
    else:
        board = board_for(client, board_path)
        board.revert()
        result = observe(client, version, board_path)
    print(canonical(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as cause:
        print(canonical({"ok": False, "error": f"{type(cause).__name__}: {cause}"}))
        raise SystemExit(1)
