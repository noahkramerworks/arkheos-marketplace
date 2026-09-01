# Security and state

The coordinator binds only `127.0.0.1`, uses a new 256-bit bearer token, caps request bodies at 2 MiB, and writes the endpoint/token descriptor beneath bridge-owned state. The extension is copied only into the bridge-owned QGIS profile, accepts a fixed identity and operation set, and has no eval or Processing path. Project and GeoJSON paths must resolve inside an enrolled root; exports must resolve beneath the bridge export directory. Extension files, checkpoints, receipts, process records, enrollments, and runtime descriptors have separate state subdirectories. Foreign files, layers, layouts, receipts, checkpoints, and processes stop closed.

