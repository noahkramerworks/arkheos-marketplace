# Protocol-only adapter

`client.py` is the fixed KiCad 10.0.5 IPC boundary. It accepts four enumerated operations over stdin JSON, connects with the official `kicad-python` 0.7.1 binding, validates application and board identity, and returns bounded JSON observations. It contains no evaluator, command runner, raw protobuf/NNG passthrough, generic property setter, or unrestricted path surface.

This directory is copied source with immutable Bridge Runtime template provenance, not a runtime dependency.
