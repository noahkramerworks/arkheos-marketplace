"""Create the deterministic native FreeCAD Bridge fixture."""

import os
import sys

import FreeCAD as App

output_value = os.environ.get("ARKHEOS_FREECAD_FIXTURE")
if not output_value:
    raise RuntimeError("missing fixture output path")
output = os.path.abspath(output_value)
doc = App.newDocument("ArkheOSFreeCADFixture")
box = doc.addObject("Part::Box", "ArkheOS_Box")
box.addProperty("App::PropertyString", "ArkheOSOwner", "ArkheOS")
box.ArkheOSOwner = "freecad-bridge"
box.Label = "ArkheOS: Fixture Box"
box.Length = 10.0
box.Width = 8.0
box.Height = 5.0
doc.recompute()
doc.saveAs(output)
App.closeDocument(doc.Name)
print(output)
