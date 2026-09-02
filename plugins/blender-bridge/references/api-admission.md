# API admission

Blender Bridge 0.3.0 is admitted against the Blender Foundation Python API embedded in the exact Blender 5.2.1 LTS executable. The executable hash and native version output bind the contract artifact.

The admitted surface has non-empty typed reads for scene, dependency-graph, animation, and render state, plus typed writes for closed scene transactions, bounded pose actions, project save, and artifact export. User input never becomes Python, an operator name, an RNA path, a driver expression, a raw loopback payload, or an unrestricted path.

`npm run test:admission` creates an isolated baseline blend, performs fixed mesh and pose-action `bpy` mutations, reads the result in a separate Blender process, matches the semantic animation digest, restores the exact original bytes, and separately verifies the restored native state. A command exit without those observations is not admission evidence.
