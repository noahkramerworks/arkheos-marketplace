# Closed semantic actions

- `create_box`: create a bridge-owned `Part::Box` with bounded positive Length, Width, and Height.
- `create_cylinder`: create a bridge-owned `Part::Cylinder` with bounded positive Radius and Height.
- `set_dimension`: set only Length/Width/Height on an owned box or Radius/Height/Angle on an owned cylinder.
- `rename_owned_feature`: set the label of one bridge-owned feature.
- `remove_owned_feature`: remove one bridge-owned feature.

Transactions contain 1..32 actions, reject extra fields, require a clean saved document and exact expected revision, recompute, save, re-inspect, and seal one receipt.
