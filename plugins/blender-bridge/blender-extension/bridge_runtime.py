"""Native Blender main-thread adapter for the closed Blender Bridge protocol."""
import hashlib
import json
import math
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

import bpy

PROTOCOL = "blender-bridge/1"
ADDON_VERSION = "0.3.0"
MAX_BODY = 4 * 1024 * 1024
MAX_ACTION_SLOTS = 256
MAX_ACTION_CHANNELS = 4096
MAX_ACTION_KEYS = 50000
_state = {"connected": False, "last_error": "", "disabled": False}

_ACTION_FIELDS = {
    "ensure_collection": {"type", "name"},
    "create_object": {"type", "name", "collection"},
    "set_transform": {"type", "object", "location", "rotationEuler", "scale"},
    "create_mesh": {"type", "name", "dataName", "collection", "vertices", "edges", "faces"},
    "edit_mesh": {"type", "object", "setVertices"},
    "create_curve": {"type", "name", "dataName", "collection", "points"},
    "create_text": {"type", "name", "dataName", "collection", "body"},
    "add_modifier": {"type", "object", "name", "modifierType", "width", "levels"},
    "ensure_material": {"type", "name", "object", "baseColor"},
    "set_material_nodes": {"type", "material", "clear", "nodes", "links"},
    "ensure_geometry_nodes": {"type", "name", "object", "modifier", "nodes"},
    "ensure_camera": {"type", "name", "dataName", "collection", "location", "rotationEuler"},
    "ensure_light": {"type", "name", "dataName", "collection", "lightType", "energy", "location"},
    "set_world": {"type", "name", "color", "strength"},
    "set_render": {"type", "engine", "width", "height"},
    "ensure_armature": {"type", "name", "dataName", "collection"},
    "add_bone": {"type", "armature", "name", "head", "tail"},
    "set_pose": {"type", "armature", "bone", "location", "rotationEuler"},
    "set_weights": {"type", "object", "group", "indices", "weight"},
    "ensure_action": {"type", "object", "name"},
    "insert_keyframe": {"type", "object", "frame", "property", "index"},
    "write_pose_action": {"type", "armature", "name", "frameStart", "frameEnd", "writeMode", "defaultInterpolation", "keys"},
    "import_asset": {"type", "path"},
    "save_project": {"type"},
}
_ACTION_REQUIRED = {
    "ensure_collection": {"name"}, "create_object": {"name"}, "set_transform": {"object"},
    "create_mesh": {"name", "dataName", "vertices", "faces"}, "edit_mesh": {"object", "setVertices"},
    "create_curve": {"name", "dataName", "points"}, "create_text": {"name", "dataName"},
    "add_modifier": {"object", "name", "modifierType"}, "ensure_material": {"name"},
    "set_material_nodes": {"material"}, "ensure_geometry_nodes": {"name"},
    "ensure_camera": {"name", "dataName"}, "ensure_light": {"name", "dataName"},
    "set_world": set(), "set_render": set(), "ensure_armature": {"name", "dataName"},
    "add_bone": {"armature", "name"}, "set_pose": {"armature", "bone"},
    "set_weights": {"object", "group", "indices", "weight"}, "ensure_action": {"object", "name"},
    "insert_keyframe": {"object", "frame"},
    "write_pose_action": {"armature", "name", "frameStart", "frameEnd", "writeMode", "defaultInterpolation", "keys"},
    "import_asset": {"path"}, "save_project": set(),
}


def _state_root():
    home = os.environ.get("CODEX_HOME") or str(Path.home() / ".codex")
    return Path(home) / "state" / "plugins" / "blender-bridge" / "v1"


def _discovery():
    file = _state_root() / "runtime" / "current.json"
    if not file.is_file():
        return None
    data = json.loads(file.read_text(encoding="utf-8"))
    if data.get("protocol") != PROTOCOL or not str(data.get("endpoint", "")).startswith("http://127.0.0.1:") or len(data.get("token", "")) < 40:
        raise RuntimeError("invalid coordinator discovery")
    return data


def _request(discovery, method, route, payload=None):
    data = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    if data and len(data) > MAX_BODY:
        raise RuntimeError("bridge payload exceeds 4 MiB")
    request = urllib.request.Request(discovery["endpoint"] + route, data=data, method=method, headers={"Authorization": "Bearer " + discovery["token"], "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=2) as response:
            body = response.read(MAX_BODY + 1)
            if len(body) > MAX_BODY:
                raise RuntimeError("coordinator response exceeds 4 MiB")
            return None if response.status == 204 or not body else json.loads(body)
    except urllib.error.HTTPError as error:
        if error.code == 204:
            return None
        raise


def _file_sha(file):
    digest = hashlib.sha256()
    with open(file, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _semantic_sha(value):
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def _animation_summary(action):
    all_slot_ids = sorted(slot.identifier for slot in action.slots)
    slot_ids = all_slot_ids[:MAX_ACTION_SLOTS]
    channel_count = 0
    key_count = 0
    bones = set()
    properties = set()
    interpolation_counts = {}
    semantic_channels = []
    complete = len(all_slot_ids) <= MAX_ACTION_SLOTS
    for layer_index, layer in enumerate(action.layers):
        for strip_index, strip in enumerate(layer.strips):
            for bag in getattr(strip, "channelbags", []):
                slot_id = bag.slot.identifier
                for curve in bag.fcurves:
                    channel_count += 1
                    curve_keys = len(curve.keyframe_points)
                    key_count += curve_keys
                    prop = curve.data_path.rsplit(".", 1)[-1]
                    properties.add(prop)
                    if curve.group and curve.data_path.startswith("pose.bones["):
                        bones.add(curve.group.name)
                    if channel_count > MAX_ACTION_CHANNELS or key_count > MAX_ACTION_KEYS:
                        complete = False
                        continue
                    keys = []
                    for point in curve.keyframe_points:
                        interpolation = point.interpolation
                        interpolation_counts[interpolation] = interpolation_counts.get(interpolation, 0) + 1
                        keys.append({
                            "frame": float(point.co[0]),
                            "value": float(point.co[1]),
                            "interpolation": interpolation,
                            "handleLeft": point.handle_left_type,
                            "handleRight": point.handle_right_type,
                        })
                    semantic_channels.append({
                        "layer": layer_index,
                        "strip": strip_index,
                        "slot": slot_id,
                        "dataPath": curve.data_path,
                        "index": curve.array_index,
                        "group": curve.group.name if curve.group else None,
                        "keys": keys,
                    })
    semantic_channels.sort(key=lambda item: (item["slot"], item["dataPath"], item["index"], item["layer"], item["strip"]))
    if len(bones) > 256 or len(properties) > 256:
        complete = False
    semantic = {
        "name": action.name,
        "frameRange": [float(action.frame_range[0]), float(action.frame_range[1])],
        "slots": slot_ids,
        "channels": semantic_channels,
    }
    return {
        "name": action.name,
        "frameRange": semantic["frameRange"],
        "slots": len(action.slots),
        "slotIdentifiers": slot_ids,
        "channelCount": channel_count,
        "keyCount": key_count,
        "bones": sorted(bones)[:256],
        "properties": sorted(properties)[:256],
        "interpolationCounts": {key: interpolation_counts[key] for key in sorted(interpolation_counts)},
        "semanticStatus": "complete" if complete else "limit-exceeded",
        "semanticDigest": _semantic_sha(semantic) if complete else None,
    }


def inspect_state(limit=200):
    limit = max(1, min(int(limit), 500))
    file = bpy.data.filepath
    scene = bpy.context.scene
    depsgraph = bpy.context.evaluated_depsgraph_get()
    objects = []
    for obj in list(scene.objects)[:limit]:
        objects.append({"name": obj.name, "type": obj.type, "data": obj.data.name if obj.data else None, "collection": [item.name for item in obj.users_collection], "location": list(obj.location), "rotationEuler": list(obj.rotation_euler), "scale": list(obj.scale), "visible": obj.visible_get(), "evaluatedType": obj.evaluated_get(depsgraph).type})
    materials = [{"name": item.name, "useNodes": item.use_nodes, "nodes": [node.bl_idname for node in item.node_tree.nodes][:limit] if item.use_nodes and item.node_tree else []} for item in list(bpy.data.materials)[:limit]]
    actions = [_animation_summary(item) for item in list(bpy.data.actions)[:limit]]
    return {"schema": "blender-bridge/observation/v1", "projectFile": file, "revision": "sha256:" + _file_sha(file) if file and Path(file).is_file() and not bpy.data.is_dirty else None, "dirty": bpy.data.is_dirty, "connection": dict(_state), "blenderVersion": bpy.app.version_string, "addonVersion": ADDON_VERSION, "scene": {"name": scene.name, "collections": [item.name for item in list(bpy.data.collections)[:limit]], "objects": objects}, "dataBlocks": {"meshes": len(bpy.data.meshes), "curves": len(bpy.data.curves), "armatures": len(bpy.data.armatures), "materials": len(bpy.data.materials), "nodeGroups": len(bpy.data.node_groups), "actions": len(bpy.data.actions)}, "selection": [item.name for item in bpy.context.selected_objects][:limit], "activeObject": bpy.context.view_layer.objects.active.name if bpy.context.view_layer.objects.active else None, "mode": bpy.context.mode, "materials": materials, "animation": actions, "render": {"engine": scene.render.engine, "resolution": [scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage], "frame": scene.frame_current}, "diagnostics": [_state["last_error"]] if _state["last_error"] else []}


def _collection(name):
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    return collection


def _object(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise ValueError("unknown object: " + name)
    return obj


def _vector(action, key, length, default):
    value = action.get(key, default)
    if not isinstance(value, list) or len(value) != length or not all(isinstance(item, (int, float)) for item in value):
        raise ValueError(key + " must be a bounded numeric vector")
    return value


def _validate_native_action(action):
    if not isinstance(action, dict) or not isinstance(action.get("type"), str):
        raise ValueError("action must be a typed object")
    kind = action["type"]
    admitted = _ACTION_FIELDS.get(kind)
    if admitted is None:
        raise ValueError("unsupported action type: " + kind)
    unknown = set(action) - admitted
    if unknown:
        raise ValueError("unknown action field: " + sorted(unknown)[0])
    missing = _ACTION_REQUIRED[kind] - set(action)
    if missing:
        raise ValueError("missing action field: " + sorted(missing)[0])


def _finite_vector(value, length, label, positive=False):
    if not isinstance(value, list) or len(value) != length:
        raise ValueError(label + " must be a bounded numeric vector")
    result = []
    for item in value:
        if isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(item) or abs(item) > 1000000:
            raise ValueError(label + " must contain finite bounded numbers")
        if positive and item <= 0:
            raise ValueError(label + " must contain positive numbers")
        result.append(float(item))
    return result


def _replaceable_action(name, armature):
    existing = bpy.data.actions.get(name)
    if existing is None:
        return [], False
    if existing.library or existing.override_library or existing.use_fake_user:
        raise ValueError("existing action is not locally replaceable")
    users = bpy.data.user_map(subset={existing}).get(existing, set())
    if any(user != armature for user in users):
        raise ValueError("existing action has a foreign binding")
    animation = armature.animation_data
    was_active = bool(animation and animation.action == existing)
    nla_strips = []
    if animation:
        for track in animation.nla_tracks:
            nla_strips.extend(strip for strip in track.strips if strip.action == existing)
    bpy.data.actions.remove(existing, do_unlink=True)
    return nla_strips, was_active


def _write_pose_action(action):
    armature = _object(action["armature"])
    if armature.type != "ARMATURE":
        raise ValueError("write_pose_action target is not an armature")
    name = action["name"]
    if not isinstance(name, str) or not 1 <= len(name) <= 128:
        raise ValueError("write_pose_action name is invalid")
    frame_start = action["frameStart"]
    frame_end = action["frameEnd"]
    if isinstance(frame_start, bool) or not isinstance(frame_start, int) or isinstance(frame_end, bool) or not isinstance(frame_end, int) or frame_start < -1048574 or frame_end > 1048574 or frame_start > frame_end:
        raise ValueError("write_pose_action frame range is invalid")
    if action["writeMode"] not in {"reject", "replace-compatible"}:
        raise ValueError("write_pose_action write mode is invalid")
    if action["defaultInterpolation"] not in {"BEZIER", "LINEAR", "CONSTANT"}:
        raise ValueError("write_pose_action interpolation is invalid")
    keys = action["keys"]
    if not isinstance(keys, list) or not 1 <= len(keys) <= 4096:
        raise ValueError("write_pose_action requires 1..4096 keys")
    pairs = set()
    bones = set()
    channels = {}
    for key in keys:
        if not isinstance(key, dict):
            raise ValueError("write_pose_action key must be an object")
        unknown = set(key) - {"bone", "frame", "location", "rotationQuaternion", "scale", "interpolation"}
        if unknown:
            raise ValueError("unknown pose key field: " + sorted(unknown)[0])
        if not {"bone", "frame"}.issubset(key) or not any(prop in key for prop in ("location", "rotationQuaternion", "scale")):
            raise ValueError("pose key requires bone, frame, and a transform")
        bone_name = key["bone"]
        frame = key["frame"]
        if not isinstance(bone_name, str) or not 1 <= len(bone_name) <= 128 or isinstance(frame, bool) or not isinstance(frame, int) or not frame_start <= frame <= frame_end:
            raise ValueError("pose key identity or frame is invalid")
        bone = armature.pose.bones.get(bone_name)
        if bone is None:
            raise ValueError("unknown pose bone: " + bone_name)
        pair = (bone_name, frame)
        if pair in pairs:
            raise ValueError("pose bone/frame keys must be unique")
        pairs.add(pair); bones.add(bone_name)
        if len(bones) > 256:
            raise ValueError("write_pose_action exceeds 256 bones")
        interpolation = key.get("interpolation", action["defaultInterpolation"])
        if interpolation not in {"BEZIER", "LINEAR", "CONSTANT"}:
            raise ValueError("pose key interpolation is invalid")
        values = {}
        if "location" in key:
            values["location"] = _finite_vector(key["location"], 3, "location")
        if "rotationQuaternion" in key:
            quaternion = _finite_vector(key["rotationQuaternion"], 4, "rotationQuaternion")
            if abs(math.sqrt(sum(item * item for item in quaternion)) - 1.0) > 0.0001:
                raise ValueError("rotationQuaternion must be unit length")
            values["rotation_quaternion"] = quaternion
            bone.rotation_mode = "QUATERNION"
        if "scale" in key:
            values["scale"] = _finite_vector(key["scale"], 3, "scale", positive=True)
        for prop, vector in values.items():
            data_path = bone.path_from_id(prop)
            for index, value in enumerate(vector):
                channels.setdefault((bone_name, data_path, index), []).append((frame, value, interpolation))
    existing = bpy.data.actions.get(name)
    if existing and action["writeMode"] == "reject":
        raise ValueError("action already exists")
    nla_strips = []
    was_active = False
    if existing:
        nla_strips, was_active = _replaceable_action(name, armature)
    action_data = bpy.data.actions.new(name)
    action_data.use_frame_range = True
    action_data.frame_start = frame_start
    action_data.frame_end = frame_end
    slot = action_data.slots.new(armature.id_type, armature.name)
    layer = action_data.layers.new("Pose")
    strip = layer.strips.new(type="KEYFRAME")
    channelbag = strip.channelbag(slot, ensure=True)
    for (bone_name, data_path, index), points in sorted(channels.items()):
        curve = channelbag.fcurves.new(data_path, index=index, group_name=bone_name)
        for frame, value, interpolation in sorted(points):
            point = curve.keyframe_points.insert(frame, value, options={"FAST"})
            point.interpolation = interpolation
            if interpolation == "BEZIER":
                point.handle_left_type = "AUTO_CLAMPED"
                point.handle_right_type = "AUTO_CLAMPED"
        curve.update()
    armature.animation_data_create()
    armature.animation_data.action = action_data
    armature.animation_data.action_slot = slot
    for nla_strip in nla_strips:
        nla_strip.action = action_data
    if not was_active and nla_strips:
        armature.animation_data.action = None


def _execute_action(action):
    _validate_native_action(action)
    kind = action["type"]
    if kind == "ensure_collection":
        _collection(action["name"])
    elif kind == "create_mesh":
        vertices = action.get("vertices", [])
        faces = action.get("faces", [])
        mesh = bpy.data.meshes.new(action["dataName"])
        mesh.from_pydata(vertices, action.get("edges", []), faces)
        mesh.validate(); mesh.update()
        obj = bpy.data.objects.new(action["name"], mesh)
        _collection(action.get("collection", "Collection")).objects.link(obj)
    elif kind == "create_object":
        obj = bpy.data.objects.new(action["name"], None)
        _collection(action.get("collection", "Collection")).objects.link(obj)
    elif kind == "set_transform":
        obj = _object(action["object"]); obj.location = _vector(action, "location", 3, list(obj.location)); obj.rotation_euler = _vector(action, "rotationEuler", 3, list(obj.rotation_euler)); obj.scale = _vector(action, "scale", 3, list(obj.scale))
    elif kind == "edit_mesh":
        obj = _object(action["object"])
        if obj.type != "MESH": raise ValueError("edit_mesh target is not a mesh")
        for item in action.get("setVertices", []): obj.data.vertices[int(item["index"])].co = _vector(item, "co", 3, [0, 0, 0])
        obj.data.update()
    elif kind == "create_curve":
        curve = bpy.data.curves.new(action["dataName"], "CURVE"); curve.dimensions = "3D"; spline = curve.splines.new("POLY"); points = action["points"]; spline.points.add(len(points) - 1)
        for point, value in zip(spline.points, points): point.co = (*value, 1.0)
        obj = bpy.data.objects.new(action["name"], curve); _collection(action.get("collection", "Collection")).objects.link(obj)
    elif kind == "create_text":
        data = bpy.data.curves.new(action["dataName"], "FONT"); data.body = action.get("body", ""); obj = bpy.data.objects.new(action["name"], data); _collection(action.get("collection", "Collection")).objects.link(obj)
    elif kind == "add_modifier":
        allowed = {"BEVEL", "SUBSURF", "MIRROR", "SOLIDIFY", "ARRAY", "NODES"}; modifier_type = action["modifierType"]
        if modifier_type not in allowed: raise ValueError("modifier type is not admitted")
        modifier = _object(action["object"]).modifiers.new(action["name"], modifier_type)
        if modifier_type == "BEVEL" and "width" in action: modifier.width = float(action["width"])
        if modifier_type == "SUBSURF" and "levels" in action: modifier.levels = int(action["levels"])
    elif kind == "ensure_material":
        material = bpy.data.materials.get(action["name"]) or bpy.data.materials.new(action["name"]); material.use_nodes = True
        if "baseColor" in action: material.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = _vector(action, "baseColor", 4, [0.8, 0.8, 0.8, 1])
        if "object" in action and material.name not in [slot.name for slot in _object(action["object"]).data.materials]: _object(action["object"]).data.materials.append(material)
    elif kind == "set_material_nodes":
        material = bpy.data.materials.get(action["material"])
        if material is None: raise ValueError("unknown material")
        material.use_nodes = True; nodes = material.node_tree.nodes; links = material.node_tree.links
        if action.get("clear"): nodes.clear()
        allowed = {"ShaderNodeOutputMaterial", "ShaderNodeBsdfPrincipled", "ShaderNodeTexNoise", "ShaderNodeValToRGB", "ShaderNodeEmission"}
        created = {}
        for item in action.get("nodes", []):
            if item["nodeType"] not in allowed: raise ValueError("shader node type not admitted")
            node = nodes.new(item["nodeType"]); node.name = item["name"]; created[node.name] = node
        for item in action.get("links", []): links.new(created[item["fromNode"]].outputs[int(item["fromSocket"])], created[item["toNode"]].inputs[int(item["toSocket"])])
    elif kind == "ensure_geometry_nodes":
        group = bpy.data.node_groups.get(action["name"]) or bpy.data.node_groups.new(action["name"], "GeometryNodeTree")
        for item in action.get("nodes", []):
            if item["nodeType"] not in {"NodeGroupInput", "NodeGroupOutput", "GeometryNodeJoinGeometry", "GeometryNodeSetPosition", "GeometryNodeTransform"}: raise ValueError("geometry node type not admitted")
            if not group.nodes.get(item["name"]): group.nodes.new(item["nodeType"]).name = item["name"]
        if "object" in action:
            modifier = _object(action["object"]).modifiers.get(action.get("modifier", "GeometryNodes")) or _object(action["object"]).modifiers.new(action.get("modifier", "GeometryNodes"), "NODES"); modifier.node_group = group
    elif kind == "ensure_camera":
        data = bpy.data.cameras.get(action["dataName"]) or bpy.data.cameras.new(action["dataName"]); obj = bpy.data.objects.get(action["name"]) or bpy.data.objects.new(action["name"], data)
        if not obj.users_collection: _collection(action.get("collection", "Collection")).objects.link(obj)
        obj.location = _vector(action, "location", 3, [0, -6, 3]); obj.rotation_euler = _vector(action, "rotationEuler", 3, [1.1, 0, 0]); bpy.context.scene.camera = obj
    elif kind == "ensure_light":
        light_type = action.get("lightType", "AREA")
        if light_type not in {"POINT", "SUN", "SPOT", "AREA"}: raise ValueError("light type not admitted")
        data = bpy.data.lights.get(action["dataName"]) or bpy.data.lights.new(action["dataName"], light_type); data.energy = float(action.get("energy", 1000)); obj = bpy.data.objects.get(action["name"]) or bpy.data.objects.new(action["name"], data)
        if not obj.users_collection: _collection(action.get("collection", "Collection")).objects.link(obj)
        obj.location = _vector(action, "location", 3, [4, -4, 6])
    elif kind == "set_world":
        world = bpy.data.worlds.get(action.get("name", "World")) or bpy.data.worlds.new(action.get("name", "World")); world.use_nodes = True; bpy.context.scene.world = world; world.node_tree.nodes["Background"].inputs["Color"].default_value = _vector(action, "color", 4, [0.05, 0.05, 0.05, 1]); world.node_tree.nodes["Background"].inputs["Strength"].default_value = float(action.get("strength", 1))
    elif kind == "set_render":
        scene = bpy.context.scene; scene.render.engine = action.get("engine", "BLENDER_EEVEE"); scene.render.resolution_x = int(action.get("width", 512)); scene.render.resolution_y = int(action.get("height", 512)); scene.render.resolution_percentage = 100; scene.render.image_settings.file_format = "PNG"
    elif kind == "ensure_armature":
        data = bpy.data.armatures.get(action["dataName"]) or bpy.data.armatures.new(action["dataName"]); obj = bpy.data.objects.get(action["name"]) or bpy.data.objects.new(action["name"], data)
        if not obj.users_collection: _collection(action.get("collection", "Collection")).objects.link(obj)
    elif kind == "add_bone":
        obj = _object(action["armature"]); bpy.context.view_layer.objects.active = obj; obj.select_set(True); bpy.ops.object.mode_set(mode="EDIT"); bone = obj.data.edit_bones.get(action["name"]) or obj.data.edit_bones.new(action["name"]); bone.head = _vector(action, "head", 3, [0, 0, 0]); bone.tail = _vector(action, "tail", 3, [0, 0, 1]); bpy.ops.object.mode_set(mode="OBJECT")
    elif kind == "set_pose":
        bone = _object(action["armature"]).pose.bones.get(action["bone"])
        if bone is None: raise ValueError("unknown pose bone")
        bone.location = _vector(action, "location", 3, list(bone.location)); bone.rotation_mode = "XYZ"; bone.rotation_euler = _vector(action, "rotationEuler", 3, list(bone.rotation_euler))
    elif kind == "set_weights":
        obj = _object(action["object"]); group = obj.vertex_groups.get(action["group"]) or obj.vertex_groups.new(name=action["group"]); group.add([int(index) for index in action["indices"]], float(action["weight"]), "REPLACE")
    elif kind == "ensure_action":
        obj = _object(action["object"]); action_data = bpy.data.actions.get(action["name"]) or bpy.data.actions.new(action["name"]); obj.animation_data_create(); slot = action_data.slots.new(obj.id_type, obj.name) if not action_data.slots else action_data.slots[0]; obj.animation_data.action = action_data; obj.animation_data.action_slot = slot
    elif kind == "insert_keyframe":
        obj = _object(action["object"])
        prop = action.get("property", "location")
        if prop not in {"location", "rotation_euler", "rotation_quaternion", "scale"}: raise ValueError("keyframe property is not admitted")
        frame = action["frame"]; index = action.get("index", -1); max_index = 3 if prop == "rotation_quaternion" else 2
        if isinstance(frame, bool) or not isinstance(frame, int) or not -1048574 <= frame <= 1048574: raise ValueError("keyframe frame is invalid")
        if isinstance(index, bool) or not isinstance(index, int) or index < -1 or index > max_index: raise ValueError("keyframe index is invalid for property")
        if obj.animation_data is None or obj.animation_data.action is None: raise ValueError("insert_keyframe requires an active object action")
        bpy.context.scene.frame_set(frame); obj.keyframe_insert(data_path=prop, index=index)
    elif kind == "write_pose_action":
        _write_pose_action(action)
    elif kind == "import_asset":
        source = str(Path(action["path"]).resolve()); suffix = Path(source).suffix.lower()
        if suffix == ".obj": bpy.ops.wm.obj_import(filepath=source)
        elif suffix == ".fbx": bpy.ops.import_scene.fbx(filepath=source)
        elif suffix in {".glb", ".gltf"}: bpy.ops.import_scene.gltf(filepath=source)
        else: raise ValueError("asset format not admitted")
    elif kind == "save_project":
        pass
    else:
        raise ValueError("unsupported action type: " + str(kind))


def apply_transaction(payload):
    if bpy.data.is_dirty:
        raise RuntimeError("Blender project is dirty")
    actions = payload.get("actions")
    if not isinstance(actions, list) or not 1 <= len(actions) <= 100:
        raise RuntimeError("actions must contain 1..100 items")
    for action in actions:
        _validate_native_action(action)
    for action in actions:
        _execute_action(action)
    bpy.ops.wm.save_as_mainfile(filepath=payload["projectFile"], check_existing=False)
    return {"status": "applied", "readback": inspect_state()}


def execute_job(job):
    if job.get("projectFile") != bpy.data.filepath:
        raise RuntimeError("project identity mismatch")
    if job["operation"] == "inspect": return {"status": "ok", "observation": inspect_state(int(job.get("input", {}).get("limit", 200)))}
    if job["operation"] == "apply_transaction": return apply_transaction(job["input"])
    if job["operation"] == "disconnect": _state["disabled"] = True; return {"status": "disconnected"}
    raise RuntimeError("operation is not admitted")


def _poll():
    if _state["disabled"]:
        return 2.0
    try:
        discovery = _discovery()
        if discovery is None or not bpy.data.filepath:
            _state["connected"] = False
            return 1.0
        envelope = {"protocol": PROTOCOL, "projectFile": bpy.data.filepath, "blenderVersion": bpy.app.version_string, "addonVersion": ADDON_VERSION}
        _request(discovery, "POST", "/v1/connect", envelope)
        _state["connected"] = True
        route = "/v1/jobs/next?projectFile=" + urllib.parse.quote(bpy.data.filepath)
        job = _request(discovery, "GET", route)
        if job:
            try: result = execute_job(job)
            except Exception as error: result = {"status": "rejected", "error": str(error)[:2000]}
            _request(discovery, "POST", "/v1/jobs/" + job["requestId"] + "/complete", result)
        _state["last_error"] = ""
        return 0.2
    except Exception as error:
        _state["connected"] = False; _state["last_error"] = str(error)[:500]
        return 1.0


class BLENDERBRIDGE_PT_status(bpy.types.Panel):
    bl_label = "Blender Bridge"
    bl_idname = "BLENDERBRIDGE_PT_status"
    bl_space_type = "PROPERTIES"
    bl_region_type = "WINDOW"
    bl_context = "scene"
    def draw(self, context):
        layout = self.layout
        layout.label(text="Paired" if _state["connected"] else "Disconnected", icon="LINKED" if _state["connected"] else "UNLINKED")
        if _state["last_error"]: layout.label(text=_state["last_error"][:120], icon="ERROR")
        layout.operator("blender_bridge.disconnect", icon="CANCEL")


class BLENDERBRIDGE_OT_disconnect(bpy.types.Operator):
    bl_idname = "blender_bridge.disconnect"
    bl_label = "Disconnect"
    def execute(self, context):
        _state["disabled"] = True; _state["connected"] = False
        return {"FINISHED"}


_classes = (BLENDERBRIDGE_PT_status, BLENDERBRIDGE_OT_disconnect)
def register():
    for cls in _classes: bpy.utils.register_class(cls)
    if not bpy.app.timers.is_registered(_poll): bpy.app.timers.register(_poll, first_interval=0.2, persistent=True)
def unregister():
    if bpy.app.timers.is_registered(_poll): bpy.app.timers.unregister(_poll)
    for cls in reversed(_classes): bpy.utils.unregister_class(cls)
