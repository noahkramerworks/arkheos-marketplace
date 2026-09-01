# KiCad API contract

Bound application: KiCad PCB Editor 10.0.5 (`pcbnew.exe` product 10.0.5, file 10.0.5.50609).

Native live protocol: KiCad's versioned IPC API, encoded with protobuf and transported over NNG. The installed schema is `share\kicad\schemas\api.v1.schema.json`. The bridge uses the official `kicad-python` 0.7.1 package, whose generated API target is `10.0.1-0-g2db9e5a72b`. The bridge pins the socket explicitly and accepts only a connected 10.0.5 server.

Admitted reads call `GetVersion`, `GetOpenDocuments`, board string serialization, board item queries, title block, enabled layer/name queries, and editor selection. Admitted writes use begin/push/drop commit around `CreateItems`, `UpdateItems`, `DeleteItems`, and `SetTitleBlockInfo`, followed by `SaveDocument`. Exact restoration uses checkpoint bytes plus native `RevertDocument` and re-read.

KiCad 10 IPC does not provide export. PNG/JPEG export is therefore a distinct constrained use of the exact `kicad-cli.exe` 10.0.5 `pcb render` command and is never represented as IPC capability.
