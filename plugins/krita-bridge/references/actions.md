# Closed semantic actions

- `create_paint_layer`: create one paint layer with an `ArkheOS_` name, color label 8, and deterministic proof pixels.
- `rename_owned_layer`: rename one bridge-owned paint layer to another bounded `ArkheOS_` name.
- `set_opacity`: set one bridge-owned paint layer to an integer opacity from 0 through 255.
- `set_visibility`: set one bridge-owned paint layer visible or hidden.
- `translate_owned_layer`: move one bridge-owned paint layer by bounded integer x/y offsets from -512 through 512.

Transactions contain 1..32 actions, reject extra fields, require a clean saved `.kra` document and exact expected revision, checkpoint the original bytes, save natively, re-inspect through a separate poll, and seal one immutable receipt. `@last_created` is the only symbolic layer selector.
