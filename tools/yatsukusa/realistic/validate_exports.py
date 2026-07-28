from __future__ import annotations

import json
import os
from pathlib import Path

import bpy


OUTPUT = Path(os.environ.get("YATSUKUSA_OUTPUT_DIR", "yatsukusa-output")).resolve()
EXPORTS = (
    ("pc_glb", OUTPUT / "YatsukusaPark_PC.glb", "gltf"),
    ("quest_glb", OUTPUT / "YatsukusaPark_Quest.glb", "gltf"),
    ("pc_fbx", OUTPUT / "YatsukusaPark_Unity.fbx", "fbx"),
    ("quest_fbx", OUTPUT / "YatsukusaPark_Quest.fbx", "fbx"),
)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def validate(label: str, path: Path, kind: str) -> dict[str, object]:
    if not path.is_file() or path.stat().st_size == 0:
        raise RuntimeError(f"{label}: missing or empty export: {path}")
    clear_scene()
    if kind == "gltf":
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif kind == "fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    else:
        raise ValueError(kind)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    vertices = sum(len(obj.data.vertices) for obj in meshes)
    triangles = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    if not meshes or vertices == 0 or triangles == 0:
        raise RuntimeError(
            f"{label}: import contained no usable mesh "
            f"(meshes={len(meshes)}, vertices={vertices}, triangles={triangles})"
        )
    return {
        "file": path.name,
        "bytes": path.stat().st_size,
        "mesh_objects": len(meshes),
        "vertices": vertices,
        "triangles": triangles,
        "reimport": "pass",
    }


results = {label: validate(label, path, kind) for label, path, kind in EXPORTS}
(OUTPUT / "export_validation.json").write_text(
    json.dumps({"blender_version": bpy.app.version_string, "exports": results}, indent=2),
    encoding="utf-8",
)
print(json.dumps(results, indent=2))
