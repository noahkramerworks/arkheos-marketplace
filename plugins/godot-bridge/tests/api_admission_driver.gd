extends SceneTree


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var scene_path := "res://admission.tscn" if args.is_empty() else str(args[0])
	var observation := {"exists": ResourceLoader.exists(scene_path, "PackedScene"), "scenePath": scene_path}
	if observation.exists:
		var packed := ResourceLoader.load(scene_path, "PackedScene", ResourceLoader.CACHE_MODE_IGNORE)
		if not packed is PackedScene:
			observation = {"exists": true, "loadable": false, "scenePath": scene_path}
		else:
			var root := (packed as PackedScene).instantiate()
			var marker := root.get_node_or_null("Marker")
			observation = {
				"exists": true,
				"loadable": true,
				"scenePath": scene_path,
				"rootName": str(root.name),
				"rootType": root.get_class(),
				"markerName": null if marker == null else str(marker.name),
				"markerType": null if marker == null else marker.get_class(),
				"markerPosition": null if marker == null else [marker.position.x, marker.position.y],
			}
			root.free()
	print("GODOT_BRIDGE_ADMISSION:" + JSON.stringify(observation))
	quit(0)
