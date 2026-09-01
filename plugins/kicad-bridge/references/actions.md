# Closed actions

Transactions contain 1..32 of these typed actions:

- `create_text`: create `ARKHEOS_BRIDGE:`-prefixed text at bounded millimetre coordinates on `Cmts.User` or `Dwgs.User`.
- `move_owned_text`: move an existing bridge-owned text ID or `@last_created` by bounded millimetre deltas.
- `set_title`: replace the title-block title with a bounded plain string.
- `delete_owned_text`: remove only an `ARKHEOS_BRIDGE:`-prefixed text object.

Every transaction requires an absolute enrolled `.kicad_pcb` path and exact expected revision. Unknown fields, generic property names, code, commands, protocol payloads, and unrestricted paths are rejected before native work.
