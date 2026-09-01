# Closed actions

- `create_track`: `index` from 0 through track count, optional `name`.
- `rename_track`: existing `index`, non-empty `name` up to 240 UTF-8 bytes.
- `set_track_volume`: existing `index`, linear `value` from 0 through 4.
- `set_track_pan`: existing `index`, `value` from -1 through 1.
- `set_track_mute`: existing `index`, boolean `value`.
- `add_stock_fx`: existing `index`, `fx` in `ReaEQ`, `ReaComp`, `ReaGate`, `ReaLimit`, or `ReaDelay`.

No raw command IDs, scripts, chunk writes, paths, plug-in identifiers, or transport recording operations are admitted.

