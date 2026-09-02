"""Bridge-owned bounded native inspection for a clean blend file."""
import importlib.util
import json
from pathlib import Path
import sys


marker = sys.argv.index("--")
result_file = Path(sys.argv[marker + 1])
runtime_file = Path(__file__).with_name("bridge_runtime.py")
spec = importlib.util.spec_from_file_location("blender_bridge_inspection_runtime", runtime_file)
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
result = runtime.inspect_state(200)
result["connection"] = {"connected": False, "mode": "owned-background-inspection"}
result_file.write_text(json.dumps(result, allow_nan=False), encoding="utf-8")
