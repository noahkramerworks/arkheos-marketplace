import importlib.util
from pathlib import Path
import sys
import bpy

marker = sys.argv.index("--")
runtime_file = Path(sys.argv[marker + 1])
spec = importlib.util.spec_from_file_location("blender_bridge_runtime", runtime_file)
bridge = importlib.util.module_from_spec(spec); spec.loader.exec_module(bridge)
project = bpy.data.filepath
actions = [
    {"type":"ensure_collection","name":"Canary"},
    {"type":"create_mesh","name":"CanaryMesh","dataName":"CanaryMeshData","collection":"Canary","vertices":[[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0],[0,0,1.8]],"faces":[[0,1,2,3],[0,4,1],[1,4,2],[2,4,3],[3,4,0]]},
    {"type":"set_transform","object":"CanaryMesh","location":[0,0,0],"rotationEuler":[0,0,0],"scale":[1,1,1]},
    {"type":"add_modifier","object":"CanaryMesh","name":"CanaryBevel","modifierType":"BEVEL","width":0.08},
    {"type":"ensure_material","name":"CanaryMaterial","object":"CanaryMesh","baseColor":[0.05,0.35,0.8,1]},
    {"type":"set_material_nodes","material":"CanaryMaterial","clear":True,"nodes":[{"name":"Output","nodeType":"ShaderNodeOutputMaterial"},{"name":"Surface","nodeType":"ShaderNodeBsdfPrincipled"}],"links":[{"fromNode":"Surface","fromSocket":0,"toNode":"Output","toSocket":0}]},
    {"type":"ensure_geometry_nodes","name":"CanaryGeometry","object":"CanaryMesh","nodes":[{"name":"Join","nodeType":"GeometryNodeJoinGeometry"},{"name":"SetPosition","nodeType":"GeometryNodeSetPosition"}]},
    {"type":"ensure_armature","name":"CanaryRig","dataName":"CanaryRigData","collection":"Canary"},
    {"type":"add_bone","armature":"CanaryRig","name":"Root","head":[0,0,0],"tail":[0,0,1.5]},
    {"type":"ensure_action","object":"CanaryMesh","name":"CanaryAction"},
    {"type":"insert_keyframe","object":"CanaryMesh","frame":1,"property":"location","index":2},
    {"type":"set_transform","object":"CanaryMesh","location":[0,0,0.5],"rotationEuler":[0,0,0],"scale":[1,1,1]},
    {"type":"insert_keyframe","object":"CanaryMesh","frame":20,"property":"location","index":2},
    {"type":"ensure_camera","name":"CanaryCamera","dataName":"CanaryCameraData","collection":"Canary","location":[4,-6,3.5],"rotationEuler":[1.15,0,0.58]},
    {"type":"ensure_light","name":"CanaryLight","dataName":"CanaryLightData","collection":"Canary","lightType":"AREA","energy":1200,"location":[3,-2,6]},
    {"type":"set_world","name":"CanaryWorld","color":[0.02,0.03,0.06,1],"strength":0.4},
    {"type":"set_render","engine":"BLENDER_EEVEE","width":320,"height":240},
    {"type":"save_project"}
]
result = bridge.apply_transaction({"projectFile":project,"actions":actions})
if result["status"] != "applied" or result["readback"]["dirty"]: raise RuntimeError("canary apply readback failed")
