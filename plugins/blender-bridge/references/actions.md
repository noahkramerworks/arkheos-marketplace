# Typed action contract

Transactions contain one to one hundred actions and at most 50,000 numeric geometry scalars or 256 node/link records. Closed action types are: `ensure_collection`, `create_object`, `set_transform`, `create_mesh`, `edit_mesh`, `create_curve`, `create_text`, `add_modifier`, `ensure_material`, `set_material_nodes`, `ensure_geometry_nodes`, `ensure_camera`, `ensure_light`, `set_world`, `set_render`, `ensure_armature`, `add_bone`, `set_pose`, `set_weights`, `ensure_action`, `insert_keyframe`, `import_asset`, and `save_project`.

Names are bounded UTF-8 strings. Object/data-block references must exist or be aliases created earlier in the validated graph. File inputs are exact absolute files explicitly declared in `externalInputs`; writes are limited to the enrolled `.blend` and declared checkpoint targets. Options are type-specific closed objects. No action accepts Python, an operator name, RNA path, driver expression, UI coordinates, or arbitrary keyword bags.
