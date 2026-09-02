"""Fixed Blender Python API admission probe. It accepts no user-authored code."""
import importlib.util
import json
from pathlib import Path
import sys

import bpy


marker = sys.argv.index("--")
mode = sys.argv[marker + 1]
project = Path(sys.argv[marker + 2]).resolve()
result_file = Path(sys.argv[marker + 3]).resolve()
runtime_file = Path(sys.argv[marker + 4]).resolve()
spec = importlib.util.spec_from_file_location("blender_bridge_admission_runtime", runtime_file)
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

if mode == "baseline":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    baseline = bpy.data.objects.new("BaselineObject", None)
    bpy.context.scene.collection.objects.link(baseline)
    bpy.ops.wm.save_as_mainfile(filepath=str(project), check_existing=False)
elif mode == "mutate":
    mesh = bpy.data.meshes.new("APIAdmissionMesh")
    mesh.from_pydata([(0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0)], [], [(0, 1, 2)])
    mesh.update()
    item = bpy.data.objects.new("APIAdmissionObject", mesh)
    bpy.context.scene.collection.objects.link(item)
    armature_data = bpy.data.armatures.new("APIAdmissionRigData")
    armature = bpy.data.objects.new("APIAdmissionRig", armature_data)
    bpy.context.scene.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bone = armature.data.edit_bones.new("Root")
    bone.head = (0.0, 0.0, 0.0); bone.tail = (0.0, 0.0, 1.0)
    bpy.ops.object.mode_set(mode="OBJECT")
    bridge._write_pose_action({"type": "write_pose_action", "armature": "APIAdmissionRig", "name": "APIAdmissionPose", "frameStart": 1, "frameEnd": 20, "writeMode": "reject", "defaultInterpolation": "BEZIER", "keys": [{"bone": "Root", "frame": 1, "location": [0, 0, 0]}, {"bone": "Root", "frame": 20, "location": [0, 0, 0.25], "interpolation": "LINEAR"}]})
    bpy.ops.wm.save_as_mainfile(filepath=str(project), check_existing=False)
elif mode != "inspect":
    raise RuntimeError("unsupported fixed admission mode")

result = {
    "mode": mode,
    "projectFile": str(project),
    "blenderVersion": bpy.app.version_string,
    "dirty": bpy.data.is_dirty,
    "objects": sorted(item.name for item in bpy.context.scene.objects),
    "meshes": sorted(item.name for item in bpy.data.meshes),
    "animation": bridge.inspect_state()["animation"],
}
result_file.write_text(json.dumps(result, sort_keys=True), encoding="utf-8")
