"""Fixed Blender Python API admission probe. It accepts no user-authored code."""
import json
from pathlib import Path
import sys

import bpy


marker = sys.argv.index("--")
mode = sys.argv[marker + 1]
project = Path(sys.argv[marker + 2]).resolve()
result_file = Path(sys.argv[marker + 3]).resolve()

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
}
result_file.write_text(json.dumps(result, sort_keys=True), encoding="utf-8")
