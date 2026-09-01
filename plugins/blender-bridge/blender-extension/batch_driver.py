"""Bridge-owned closed batch renderer/exporter. Arguments are bridge-produced JSON only."""
import hashlib
import json
from pathlib import Path
import sys

import bpy


def sha(file):
    digest = hashlib.sha256()
    with open(file, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    marker = sys.argv.index("--")
    request_file = Path(sys.argv[marker + 1])
    result_file = Path(sys.argv[marker + 2])
    request = json.loads(request_file.read_text(encoding="utf-8"))
    if Path(bpy.data.filepath).resolve() != Path(request["projectFile"]).resolve():
        raise RuntimeError("batch project identity mismatch")
    output = str(Path(request["stagingPath"]).resolve())
    operation = request["operation"]
    if operation in {"render", "viewport"}:
        scene = bpy.context.scene
        if scene.camera is None:
            raise RuntimeError("render requires an active camera")
        scene.render.filepath = output
        scene.render.image_settings.file_format = "PNG"
        if operation == "viewport":
            scene.render.resolution_x = int(request.get("width", 512)); scene.render.resolution_y = int(request.get("height", 512)); scene.render.resolution_percentage = 100
        bpy.ops.render.render(write_still=True)
        width, height = scene.render.resolution_x, scene.render.resolution_y
        native = {"engine": scene.render.engine, "camera": scene.camera.name, "width": width, "height": height}
    elif operation == "export":
        fmt = request["format"]
        options = request.get("options", {})
        if fmt == "glb": bpy.ops.export_scene.gltf(filepath=output, export_format="GLB", use_selection=bool(options.get("selectedOnly", False)))
        elif fmt == "fbx": bpy.ops.export_scene.fbx(filepath=output, use_selection=bool(options.get("selectedOnly", False)), apply_unit_scale=True)
        elif fmt == "usd": bpy.ops.wm.usd_export(filepath=output, selected_objects_only=bool(options.get("selectedOnly", False)), export_animation=bool(options.get("animation", True)))
        elif fmt == "obj": bpy.ops.wm.obj_export(filepath=output, export_selected_objects=bool(options.get("selectedOnly", False)), export_materials=bool(options.get("materials", True)))
        elif fmt == "alembic": bpy.ops.wm.alembic_export(filepath=output, selected=bool(options.get("selectedOnly", False)), start=int(options.get("start", bpy.context.scene.frame_start)), end=int(options.get("end", bpy.context.scene.frame_end)))
        else: raise RuntimeError("export format not admitted")
        native = {"format": fmt, "objects": len(bpy.context.scene.objects), "frameRange": [bpy.context.scene.frame_start, bpy.context.scene.frame_end]}
    else:
        raise RuntimeError("batch operation not admitted")
    file = Path(output)
    if not file.is_file() or file.stat().st_size <= 0:
        raise RuntimeError("native artifact missing")
    result_file.write_text(json.dumps({"status": "completed", "path": output, "size": file.stat().st_size, "sha256": sha(file), "nativeReadback": native}), encoding="utf-8")


try:
    main()
except Exception as error:
    marker = sys.argv.index("--") if "--" in sys.argv else -1
    if marker >= 0 and len(sys.argv) > marker + 2:
        Path(sys.argv[marker + 2]).write_text(json.dumps({"status": "failed", "error": str(error)[:2000]}), encoding="utf-8")
    raise
