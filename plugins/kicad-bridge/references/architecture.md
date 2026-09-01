# Architecture

The Node MCP server owns admission, enrolled roots, process ownership, checkpoints, receipts, export paths, and six closed tool contracts. It invokes only the source-owned fixed Python client with an enumerated operation and JSON over stdin. The Python client speaks KiCad's official NNG/protobuf IPC API through `kicad-python` 0.7.1; it has no generic evaluator or protocol passthrough. `kicad-cli.exe` is a separately identified, fixed export boundary.

Bridge-owned KiCad instances run with isolated `KICAD_CONFIG_HOME`, `KICAD_DOCUMENTS_HOME`, `TEMP`, and `TMP` roots. Source, durable state, enrolled boards, application files, immutable Bridge Runtime evidence, marketplace source, installed cache, and fresh-task discovery remain distinct authorities.
