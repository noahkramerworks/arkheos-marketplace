"""Bridge-owned bounded native inspection for a clean blend file."""
import hashlib
import json
from pathlib import Path
import sys
import bpy

marker = sys.argv.index("--")
result_file = Path(sys.argv[marker + 1])
project = Path(bpy.data.filepath)
digest = hashlib.sha256(project.read_bytes()).hexdigest()
scene = bpy.context.scene
depsgraph = bpy.context.evaluated_depsgraph_get()
objects = [{"name": item.name, "type": item.type, "data": item.data.name if item.data else None, "evaluatedType": item.evaluated_get(depsgraph).type, "location": list(item.location), "rotationEuler": list(item.rotation_euler), "scale": list(item.scale)} for item in list(scene.objects)[:200]]
materials = [{"name": item.name, "useNodes": item.use_nodes, "nodes": [node.bl_idname for node in item.node_tree.nodes][:200] if item.use_nodes and item.node_tree else []} for item in list(bpy.data.materials)[:200]]
result = {"schema": "blender-bridge/observation/v1", "projectFile": str(project), "revision": "sha256:" + digest, "dirty": bpy.data.is_dirty, "connection": {"connected": False, "mode": "owned-background-inspection"}, "blenderVersion": bpy.app.version_string, "scene": {"name": scene.name, "collections": [item.name for item in list(bpy.data.collections)[:200]], "objects": objects}, "dataBlocks": {"meshes": len(bpy.data.meshes), "curves": len(bpy.data.curves), "armatures": len(bpy.data.armatures), "materials": len(bpy.data.materials), "nodeGroups": len(bpy.data.node_groups), "actions": len(bpy.data.actions)}, "selection": [item.name for item in bpy.context.selected_objects][:200], "activeObject": bpy.context.view_layer.objects.active.name if bpy.context.view_layer.objects.active else None, "mode": bpy.context.mode, "materials": materials, "animation": [{"name": item.name, "frameRange": list(item.frame_range), "slots": len(item.slots)} for item in list(bpy.data.actions)[:200]], "render": {"engine": scene.render.engine, "resolution": [scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage], "camera": scene.camera.name if scene.camera else None}, "diagnostics": []}
result_file.write_text(json.dumps(result), encoding="utf-8")
