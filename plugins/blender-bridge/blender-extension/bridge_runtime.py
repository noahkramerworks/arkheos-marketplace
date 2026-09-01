"""Native Blender main-thread adapter for the closed Blender Bridge protocol."""
import hashlib
import json
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

import bpy

PROTOCOL = "blender-bridge/1"
ADDON_VERSION = "0.2.0"
MAX_BODY = 4 * 1024 * 1024
_state = {"connected": False, "last_error": "", "disabled": False}


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


def inspect_state(limit=200):
    file = bpy.data.filepath
    scene = bpy.context.scene
    depsgraph = bpy.context.evaluated_depsgraph_get()
    objects = []
    for obj in list(scene.objects)[:limit]:
        objects.append({"name": obj.name, "type": obj.type, "data": obj.data.name if obj.data else None, "collection": [item.name for item in obj.users_collection], "location": list(obj.location), "rotationEuler": list(obj.rotation_euler), "scale": list(obj.scale), "visible": obj.visible_get(), "evaluatedType": obj.evaluated_get(depsgraph).type})
    materials = [{"name": item.name, "useNodes": item.use_nodes, "nodes": [node.bl_idname for node in item.node_tree.nodes][:limit] if item.use_nodes and item.node_tree else []} for item in list(bpy.data.materials)[:limit]]
    actions = [{"name": item.name, "frameRange": list(item.frame_range), "slots": len(item.slots)} for item in list(bpy.data.actions)[:limit]]
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


def _execute_action(action):
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
        obj = _object(action["object"]); bpy.context.scene.frame_set(int(action["frame"])); obj.keyframe_insert(data_path=action.get("property", "location"), index=int(action.get("index", -1)))
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
    for action in payload["actions"]:
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
