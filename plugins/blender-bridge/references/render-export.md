# Render and export

Owned renders bind the enrolled project revision and use bridge-owned background processes. Output is written to collision-free staging, checked as PNG, hashed, atomically promoted to an absent final path outside the project, and rehashed. Cancellation addresses only the recorded process identity.

Exports support `glb`, `fbx`, `usd`, `obj`, and `alembic` with closed options. GLB maps `animation`, `materials`, and `extras` booleans explicitly; omitted options preserve animation and materials while leaving extras off. `extras` is rejected for other formats. Output directories must exist outside the project. Reparse/symlink ancestors, existing finals, extensions inconsistent with format, and source/destination overlap are rejected. Blender readback plus final hash and size are recorded in immutable artifact receipts.
