"""Closed deterministic STEP/STL export for FreeCAD Bridge."""

import json
import os
import sys

import FreeCAD as App
import Mesh
import Part


def main():
    job_file = os.environ.get("ARKHEOS_FREECAD_JOB")
    if not job_file:
        raise RuntimeError("missing closed job file")
    with open(job_file, "r", encoding="utf-8") as stream:
        job = json.load(stream)
    if set(job) != {"schema", "jobId", "documentPath", "outputPath", "format", "expectedSha256"} or job["schema"] != "freecad-bridge/export-job/v1" or job["format"] not in {"step", "stl"}:
        raise RuntimeError("invalid closed export job")
    doc = App.openDocument(os.path.abspath(job["documentPath"]))
    try:
        objects = [obj for obj in doc.Objects if hasattr(obj, "Shape") and not obj.Shape.isNull()]
        if not objects:
            raise RuntimeError("document has no exportable shapes")
        output = os.path.abspath(job["outputPath"])
        if job["format"] == "step":
            Part.export(objects, output)
        else:
            Mesh.export(objects, output)
        print("ARKHEOS_RESULT " + json.dumps({"objects": len(objects), "outputPath": output, "format": job["format"]}, sort_keys=True))
    finally:
        App.closeDocument(doc.Name)


main()
