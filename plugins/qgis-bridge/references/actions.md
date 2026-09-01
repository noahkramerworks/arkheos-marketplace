# Closed semantic actions

- `add_geojson_layer`: add one enrolled GeoJSON LineString source as a bridge-owned vector layer.
- `set_single_symbol`: set an owned line layer to one bounded color and line width.
- `rename_owned_layer`: change the display name of one bridge-owned layer.
- `ensure_layout`: create or update the bridge-owned print layout with a map item.
- `remove_owned_layer`: remove one bridge-owned layer.

Transactions contain 1..32 actions, reject extra fields, require a clean saved project and exact expected revision, write the project, re-inspect it through a separate poll, and seal one receipt.

