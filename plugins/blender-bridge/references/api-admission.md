# API admission

Blender Bridge 0.2.0 is admitted against the Blender Foundation Python API embedded in the exact Blender 5.2.1 LTS executable. The executable hash and native version output bind the contract artifact.

The admitted surface has non-empty typed reads for scene, dependency-graph, and render state, plus typed writes for closed scene transactions, project save, and artifact export. User input never becomes Python, an operator name, an RNA path, a driver expression, a raw loopback payload, or an unrestricted path.

`npm run test:admission` creates an isolated baseline blend, performs a fixed `bpy` mutation, reads the result in a separate Blender process, restores the exact original bytes, and separately verifies the restored native state. A command exit without those observations is not admission evidence.
