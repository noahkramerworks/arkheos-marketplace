@tool
extends EditorPlugin

const PROTOCOL := "godot-bridge/ipc/v1"
const ADDON_VERSION := "0.2.0"
const MAX_BODY_BYTES := 2 * 1024 * 1024
const MAX_SCREENSHOT_BYTES := 16 * 1024 * 1024
const POLL_SECONDS := 0.10
const SCREENSHOT_TIMEOUT_MSEC := 5000
const RESOURCE_TYPES := ["StandardMaterial3D", "ShaderMaterial", "Theme", "StyleBoxFlat", "Gradient", "GradientTexture1D", "Curve", "Curve2D", "Curve3D", "Animation", "AnimationLibrary", "BoxMesh", "SphereMesh", "CapsuleMesh", "QuadMesh", "RectangleShape2D", "CircleShape2D", "BoxShape3D", "SphereShape3D", "CapsuleShape3D"]


class BridgeDebugger extends EditorDebuggerPlugin:
	var responses: Dictionary = {}


	func _has_capture(capture: String) -> bool:
		return capture == "game_view"


	func _capture(message: String, data: Array, _session_id: int) -> bool:
		if message != "game_view:get_screenshot":
			return false
		if data.size() != 4:
			return true
		var request_id := int(data[0])
		responses[request_id] = {"width": int(data[1]), "height": int(data[2]), "path": str(data[3])}
		return true


	func request_screenshot(request_id: int) -> bool:
		var sent := false
		for session_value in get_sessions():
			var session := session_value as EditorDebuggerSession
			if session != null and session.is_active():
				session.send_message("scene:rq_screenshot", [request_id])
				sent = true
		return sent


	func take_response(request_id: int) -> Dictionary:
		if not responses.has(request_id):
			return {}
		var response: Dictionary = responses[request_id]
		responses.erase(request_id)
		return response

var _endpoint := ""
var _token := ""
var _project_root := ""
var _http: HTTPRequest
var _timer: Timer
var _debugger: BridgeDebugger
var _busy := false
var _connected := false
var _active_run: Dictionary = {}
var _diagnostics: Array = []
var _clean_scene_versions: Dictionary = {}


func _enter_tree() -> void:
	scene_changed.connect(_on_scene_changed)
	scene_saved.connect(_on_scene_saved)
	_debugger = BridgeDebugger.new()
	add_debugger_plugin(_debugger)
	_load_discovery()
	if _endpoint.is_empty() or _token.is_empty():
		print("Codex Godot Bridge inactive: no runtime discovery")
		return
	_http = HTTPRequest.new()
	_http.timeout = 10.0
	add_child(_http)
	_timer = Timer.new()
	_timer.wait_time = POLL_SECONDS
	_timer.one_shot = false
	_timer.timeout.connect(_poll)
	add_child(_timer)
	_timer.start()
	_poll()
	call_deferred("_remember_active_scene_baseline")


func _exit_tree() -> void:
	if is_instance_valid(_timer): _timer.stop()
	if is_instance_valid(_http): _http.cancel_request()
	if _debugger != null:
		remove_debugger_plugin(_debugger)
		_debugger = null
	_connected = false
	_clean_scene_versions.clear()


func _scene_version(root: Node) -> int:
	if root == null:
		return -1
	var manager := EditorInterface.get_editor_undo_redo()
	var history_id := manager.get_object_history_id(root)
	var history := manager.get_history_undo_redo(history_id)
	return -1 if history == null else history.get_version()


func _remember_active_scene_baseline() -> void:
	_on_scene_changed(EditorInterface.get_edited_scene_root())


func _on_scene_changed(root: Node) -> void:
	if root == null or root.scene_file_path.is_empty():
		return
	if not _clean_scene_versions.has(root.scene_file_path):
		_clean_scene_versions[root.scene_file_path] = _scene_version(root)


func _on_scene_saved(scene_path: String) -> void:
	var root := EditorInterface.get_edited_scene_root()
	if root != null and root.scene_file_path == scene_path:
		_clean_scene_versions[scene_path] = _scene_version(root)


func _active_scene_is_clean(scene_path: String) -> bool:
	var root := EditorInterface.get_edited_scene_root()
	if root == null or root.scene_file_path != scene_path or not _clean_scene_versions.has(scene_path):
		return false
	return int(_clean_scene_versions[scene_path]) == _scene_version(root)


func _load_discovery() -> void:
	_endpoint = OS.get_environment("GODOT_BRIDGE_COORDINATOR_URL").trim_suffix("/")
	_token = OS.get_environment("GODOT_BRIDGE_TOKEN")
	_project_root = ProjectSettings.globalize_path("res://").simplify_path().trim_suffix("/").trim_suffix("\\")
	if not _endpoint.is_empty() and not _token.is_empty(): return
	var codex_home := OS.get_environment("CODEX_HOME")
	if codex_home.is_empty():
		var profile := OS.get_environment("USERPROFILE")
		if not profile.is_empty(): codex_home = profile.path_join(".codex")
	if codex_home.is_empty(): return
	var file := FileAccess.open(codex_home.path_join("state/plugins/godot-bridge/v1/runtime/current.json"), FileAccess.READ)
	if file == null: return
	if file.get_length() > 65536:
		file.close()
		return
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	file.close()
	if parsed is Dictionary and parsed.get("protocol") == PROTOCOL:
		_endpoint = str(parsed.get("endpoint", "")).trim_suffix("/")
		_token = str(parsed.get("token", ""))


func _headers() -> PackedStringArray:
	return PackedStringArray(["Authorization: Bearer %s" % _token, "Accept: application/json", "Content-Type: application/json"])


func _request(method: HTTPClient.Method, route: String, payload: Variant = null) -> Dictionary:
	var text := "" if payload == null else JSON.stringify(payload)
	var start := _http.request(_endpoint + route, _headers(), method, text)
	if start != OK: return {"ok": false, "error": "REQUEST_START_FAILED"}
	var response: Array = await _http.request_completed
	if response[0] != HTTPRequest.RESULT_SUCCESS: return {"ok": false, "error": "REQUEST_FAILED", "status": response[1]}
	var status: int = response[1]
	var bytes: PackedByteArray = response[3]
	if bytes.size() > MAX_BODY_BYTES: return {"ok": false, "error": "RESPONSE_TOO_LARGE", "status": status}
	if status == 204: return {"ok": true, "status": 204, "body": null}
	if status < 200 or status >= 300: return {"ok": false, "error": "HTTP_%d" % status, "status": status}
	var body: Variant = {} if bytes.is_empty() else JSON.parse_string(bytes.get_string_from_utf8())
	if body == null: return {"ok": false, "error": "INVALID_JSON", "status": status}
	return {"ok": true, "status": status, "body": body}


func _poll() -> void:
	if _busy or _endpoint.is_empty(): return
	_busy = true
	if not _connected:
		var registration := await _request(HTTPClient.METHOD_POST, "/v1/connect", {"protocol": PROTOCOL, "projectRoot": _project_root, "addonVersion": ADDON_VERSION, "engineVersion": Engine.get_version_info().string})
		_connected = registration.ok
		_busy = false
		return
	var encoded_root := _project_root.uri_encode()
	var response := await _request(HTTPClient.METHOD_GET, "/v1/jobs/next?projectRoot=" + encoded_root)
	if not response.ok or response.status == 204:
		if not response.ok: _connected = false
		_busy = false
		return
	var job: Variant = response.body
	var result := await _dispatch(job)
	await _request(HTTPClient.METHOD_POST, "/v1/jobs/%s/complete" % str(job.get("requestId", "invalid")), result)
	_busy = false


func _dispatch(job: Variant) -> Dictionary:
	if not job is Dictionary: return {"status": "rejected", "error": "job must be object"}
	if job.get("protocol") != PROTOCOL or str(job.get("projectRoot", "")).simplify_path().to_lower() != _project_root.to_lower(): return {"status": "rejected", "error": "job identity mismatch"}
	var deadline := Time.get_unix_time_from_datetime_string(str(job.get("deadline", "")))
	if deadline > 0 and Time.get_unix_time_from_system() > deadline: return {"status": "rejected", "error": "job deadline expired"}
	var input: Dictionary = job.get("input", {}) if job.get("input", {}) is Dictionary else {}
	match str(job.get("operation", "")):
		"inspect_project": return _inspect_project()
		"apply_transaction": return await _apply_transaction(input)
		"prepare_external_restore": return await _prepare_external_restore(input)
		"reload_project": return await _reload_project(input)
		"start_playtest": return _start_playtest(input)
		"inspect_playtest": return _inspect_playtest(input)
		"capture_viewport": return await _capture_viewport(input)
		"stop_playtest": return _stop_playtest(input)
	return {"status": "rejected", "error": "unsupported operation"}


func _scene_node(node: Node, depth: int = 0) -> Dictionary:
	var children: Array = []
	if depth < 32:
		for child in node.get_children():
			if child is Node: children.append(_scene_node(child, depth + 1))
	return {"name": node.name, "path": str(node.get_path()), "type": node.get_class(), "sceneFilePath": node.scene_file_path, "script": node.get_script().resource_path if node.get_script() is Script else null, "children": children}


func _scan_files(directory: String, relative: String = "") -> Array:
	var output: Array = []
	var dir := DirAccess.open(directory)
	if dir == null: return output
	dir.list_dir_begin()
	var name := dir.get_next()
	while not name.is_empty():
		if name != ".godot" and name != "codex_godot_bridge":
			var full := directory.path_join(name)
			var rel := relative.path_join(name).replace("\\", "/")
			if dir.current_is_dir(): output.append_array(_scan_files(full, rel))
			elif name.get_extension().to_lower() in ["gd", "gdshader", "tscn", "tres", "res"]:
				output.append({"path": "res://" + rel, "size": FileAccess.get_file_as_bytes(full).size(), "sha256": FileAccess.get_sha256(full)})
		name = dir.get_next()
	dir.list_dir_end()
	return output


func _inspect_project() -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	var dirty := root != null and not root.scene_file_path.is_empty() and not _active_scene_is_clean(root.scene_file_path)
	var files := _scan_files(_project_root)
	var scripts: Array = []
	var resources: Array = []
	for item in files:
		if str(item.path).ends_with(".gd"): scripts.append(item)
		else: resources.append(item)
	return {
		"status": "observed", "dirty": dirty,
		"engine": {"version": Engine.get_version_info().string},
		"editor": {"addonVersion": ADDON_VERSION, "connected": true, "openScenes": EditorInterface.get_open_scenes()},
		"scene": null if root == null else {"path": root.scene_file_path, "tree": _scene_node(root)},
		"scripts": scripts.slice(0, 500), "resources": resources.slice(0, 500), "diagnostics": _diagnostics.slice(-200),
		"imports": {"scanning": EditorInterface.get_resource_filesystem().is_scanning()},
		"playtest": null if _active_run.is_empty() else {"runId": _active_run.runId, "running": EditorInterface.is_playing_scene()}, "nextCursor": null,
	}


func _decode(value: Variant, aliases: Dictionary) -> Variant:
	if value is Array:
		var array: Array = []
		for item in value: array.append(_decode(item, aliases))
		return array
	if not value is Dictionary: return value
	if not value.has("$type"):
		var dictionary := {}
		for key in value: dictionary[key] = _decode(value[key], aliases)
		return dictionary
	var data: Variant = value.get("value")
	match str(value.get("$type")):
		"Vector2": return Vector2(float(data[0]), float(data[1]))
		"Vector3": return Vector3(float(data[0]), float(data[1]), float(data[2]))
		"Vector4": return Vector4(float(data[0]), float(data[1]), float(data[2]), float(data[3]))
		"Color": return Color(float(data[0]), float(data[1]), float(data[2]), float(data[3]))
		"Rect2": return Rect2(float(data[0]), float(data[1]), float(data[2]), float(data[3]))
		"Quaternion": return Quaternion(float(data[0]), float(data[1]), float(data[2]), float(data[3]))
		"Transform2D": return Transform2D(Vector2(float(data[0]), float(data[1])), Vector2(float(data[2]), float(data[3])), Vector2(float(data[4]), float(data[5])))
		"Basis": return Basis(Vector3(float(data[0]), float(data[1]), float(data[2])), Vector3(float(data[3]), float(data[4]), float(data[5])), Vector3(float(data[6]), float(data[7]), float(data[8])))
		"Transform3D": return Transform3D(Basis(Vector3(float(data[0]), float(data[1]), float(data[2])), Vector3(float(data[3]), float(data[4]), float(data[5])), Vector3(float(data[6]), float(data[7]), float(data[8]))), Vector3(float(data[9]), float(data[10]), float(data[11])))
		"NodePath": return NodePath(str(value.get("path", data)))
		"Resource": return ResourceLoader.load(str(value.get("path", "")))
		"Alias": return aliases.get(str(value.get("alias", "")))
	return null


func _node(root: Node, aliases: Dictionary, reference: Variant) -> Node:
	if reference is Dictionary and reference.get("$type") == "Alias": return aliases.get(str(reference.get("alias", ""))) as Node
	if reference is String:
		if reference == "." or reference == str(root.get_path()) or reference == root.name: return root
		return root.get_node_or_null(NodePath(reference))
	return null


func _class_property(object: Object, property: String) -> bool:
	for item in object.get_property_list():
		if str(item.name) == property: return true
	return false


func _safe_resource_path(value: Variant, suffixes: Array = []) -> String:
	if not value is String or not value.begins_with("res://") or value.contains("..") or value.contains("\\"): return ""
	if not suffixes.is_empty() and value.get_extension().to_lower() not in suffixes: return ""
	return value


func _scene_is_open(scene_path: String) -> bool:
	return scene_path in EditorInterface.get_open_scenes()


func _activate_open_scene(scene_path: String) -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	if root != null and root.scene_file_path == scene_path:
		return {"status": "verified"}
	if not _scene_is_open(scene_path):
		return {"status": "rejected", "error": "scene is not open"}
	EditorInterface.open_scene_from_path(scene_path)
	await get_tree().process_frame
	await get_tree().process_frame
	root = EditorInterface.get_edited_scene_root()
	if root == null or root.scene_file_path != scene_path:
		return {"status": "rejected", "error": "could not activate open scene"}
	return {"status": "verified"}


func _close_clean_scene_for_external_write(scene_path: String) -> Dictionary:
	if not _scene_is_open(scene_path):
		return {"status": "verified", "closed": false, "scenePath": scene_path}
	var activated := await _activate_open_scene(scene_path)
	if activated.status != "verified":
		return activated
	if not _active_scene_is_clean(scene_path):
		return {"status": "rejected", "error": "scene has unsaved or untracked editor changes", "scenePath": scene_path}
	var close_error := EditorInterface.close_scene()
	await get_tree().process_frame
	if close_error != OK or _scene_is_open(scene_path):
		return {"status": "rejected", "error": "could not close scene before external write", "scenePath": scene_path}
	_clean_scene_versions.erase(scene_path)
	return {"status": "verified", "closed": true, "scenePath": scene_path}


func _open_scene_after_external_write(scene_path: String) -> Dictionary:
	if scene_path.is_empty() or not ResourceLoader.exists(scene_path, "PackedScene"):
		return {"status": "rejected", "error": "scene is unavailable after external write", "scenePath": scene_path}
	EditorInterface.open_scene_from_path(scene_path)
	await get_tree().process_frame
	await get_tree().process_frame
	var root := EditorInterface.get_edited_scene_root()
	if root == null or root.scene_file_path != scene_path:
		return {"status": "rejected", "error": "scene could not be reopened after external write", "scenePath": scene_path}
	_clean_scene_versions[scene_path] = _scene_version(root)
	return {"status": "verified", "scenePath": scene_path}


func _prepare_external_restore(input: Dictionary) -> Dictionary:
	var targets: Variant = input.get("targets", [])
	if not targets is Array or targets.size() > 100:
		return {"status": "rejected", "error": "invalid restore target list"}
	var scene_paths: Array[String] = []
	for target_value in targets:
		var target := _safe_resource_path(target_value)
		if target.is_empty():
			return {"status": "rejected", "error": "invalid restore target"}
		if target.get_extension().to_lower() == "tscn" and target not in scene_paths:
			scene_paths.append(target)
	for scene_path in scene_paths:
		var prepared := await _close_clean_scene_for_external_write(scene_path)
		if prepared.status != "verified":
			return prepared
	return {"status": "verified", "prepared": true, "scenePaths": scene_paths}


func _apply_transaction(transaction: Dictionary) -> Dictionary:
	var actions: Variant = transaction.get("actions")
	if not actions is Array or actions.is_empty() or actions.size() > 50: return {"status": "rejected", "error": "invalid action list"}
	var scene_path := _safe_resource_path(transaction.get("scenePath", ""), ["tscn"]) if transaction.has("scenePath") and transaction.scenePath != null else ""
	var scene_mutated := false
	for action_value in actions:
		if action_value is Dictionary and str(action_value.get("type", "")) in ["scene.create", "scene.instantiate", "scene.save", "node.create", "node.remove", "node.move", "node.rename", "node.duplicate", "node.set_property", "script.attach", "script.detach", "signal.connect", "signal.disconnect"]:
			scene_mutated = true
			break
	var scene_was_open := scene_mutated and not scene_path.is_empty() and _scene_is_open(scene_path)
	var scene_preparation := {"status": "verified", "closed": false, "scenePath": scene_path}
	if scene_was_open:
		scene_preparation = await _close_clean_scene_for_external_write(scene_path)
		if scene_preparation.status != "verified":
			return scene_preparation
	var root: Node = null
	var aliases := {}
	if scene_mutated and not scene_path.is_empty() and ResourceLoader.exists(scene_path, "PackedScene"):
		var packed := ResourceLoader.load(scene_path, "PackedScene", ResourceLoader.CACHE_MODE_IGNORE)
		if packed is PackedScene: root = packed.instantiate()
	var changed: Array[String] = []
	for action_index in range(actions.size()):
		var action_value: Variant = actions[action_index]
		if not action_value is Dictionary:
			if root != null: root.free()
			return {"status": "rejected", "error": "action %d must be object" % action_index}
		var action: Dictionary = action_value
		var error := _apply_action(action, root, aliases)
		if error.has("root"): root = error.root
		if error.has("scenePath"): scene_path = error.scenePath
		if error.has("changed"): changed.append(str(error.changed))
		if error.has("error"):
			if root != null: root.free()
			return {"status": "rejected", "error": "action %d (%s): %s" % [action_index, str(action.get("type", "")), str(error.error)], "changedTargets": changed}
	if scene_mutated and root != null and not scene_path.is_empty():
		var packed_scene := PackedScene.new()
		if packed_scene.pack(root) != OK:
			root.free()
			return {"status": "rejected", "error": "could not pack scene", "closedScenes": [scene_path] if scene_preparation.closed else []}
		if ResourceSaver.save(packed_scene, scene_path) != OK:
			root.free()
			return {"status": "rejected", "error": "could not save scene", "closedScenes": [scene_path] if scene_preparation.closed else []}
		if scene_path not in changed: changed.append(scene_path)
		root.free()
	EditorInterface.get_resource_filesystem().scan()
	await get_tree().process_frame
	var reopened := not scene_mutated or not scene_was_open
	if scene_mutated and (scene_was_open or not scene_path.is_empty()):
		var opened := await _open_scene_after_external_write(scene_path)
		if opened.status != "verified":
			return {"status": "rejected", "error": opened.error, "closedScenes": [scene_path] if scene_preparation.closed else [], "changedTargets": changed}
		reopened = true
	var verification := {"scenePath": scene_path, "sceneMutated": scene_mutated, "sceneWasOpen": scene_was_open, "closedBeforeWrite": bool(scene_preparation.closed), "reopenedAfterWrite": reopened, "sceneLoadable": scene_path.is_empty() or ResourceLoader.load(scene_path, "PackedScene", ResourceLoader.CACHE_MODE_IGNORE) is PackedScene, "aliases": aliases.keys(), "changedTargets": changed}
	if not verification.sceneLoadable: return {"status": "rejected", "error": "scene readback failed", "verification": verification}
	return {"status": "verified", "verification": verification, "changedTargets": changed}


func _apply_action(action: Dictionary, root: Node, aliases: Dictionary) -> Dictionary:
	var kind := str(action.get("type", ""))
	# Keep file import outside the large match. Godot 4.7.1 can skip this late
	# string branch in the EditorPlugin method even though the same pattern
	# matches in isolation.
	if kind == "asset.import":
		return _import_asset(action)
	match kind:
		"scene.create":
			if root != null: return {"error": "scene already bound"}
			var root_class := str(action.get("rootType", "Node2D"))
			if not ClassDB.class_exists(root_class) or not ClassDB.is_parent_class(root_class, "Node"): return {"error": "invalid scene root type"}
			var created := ClassDB.instantiate(root_class) as Node
			created.name = str(action.get("rootName", "Main"))
			var target := _safe_resource_path(action.get("path", ""), ["tscn"])
			if target.is_empty(): created.free(); return {"error": "invalid scene path"}
			if action.has("alias"): aliases[action.alias] = created
			return {"root": created, "scenePath": target, "changed": target}
		"node.create":
			if root == null: return {"error": "scene root is missing"}
			var parent := _node(root, aliases, action.get("parent", "."))
			var node_type := str(action.get("nodeType", ""))
			if parent == null or not ClassDB.class_exists(node_type) or not ClassDB.is_parent_class(node_type, "Node"): return {"error": "invalid node create contract"}
			var child := ClassDB.instantiate(node_type) as Node
			child.name = str(action.get("name", node_type))
			parent.add_child(child)
			child.owner = root
			if action.has("alias"): aliases[action.alias] = child
			return {}
		"node.remove":
			var target := _node(root, aliases, action.get("target"))
			if target == null or target == root: return {"error": "invalid node removal"}
			target.get_parent().remove_child(target); target.free(); return {}
		"node.rename":
			var target := _node(root, aliases, action.get("target")); if target == null: return {"error": "node not found"}
			target.name = str(action.get("name", "")); return {}
		"node.set_property":
			var target := _node(root, aliases, action.get("target")); var property := str(action.get("property", ""))
			if target == null or not _class_property(target, property): return {"error": "node property not found"}
			target.set(property, _decode(action.get("value"), aliases)); return {}
		"node.move":
			var target := _node(root, aliases, action.get("target")); var parent := _node(root, aliases, action.get("parent"))
			if target == null or parent == null or target == root: return {"error": "invalid node move"}
			target.reparent(parent); target.owner = root; return {}
		"node.duplicate":
			var target := _node(root, aliases, action.get("target")); var parent := _node(root, aliases, action.get("parent", "."))
			if target == null or parent == null: return {"error": "invalid duplicate"}
			var duplicate := target.duplicate(); duplicate.name = str(action.get("name", target.name + "Copy")); parent.add_child(duplicate); duplicate.owner = root
			if action.has("alias"): aliases[action.alias] = duplicate
			return {}
		"script.write":
			var script_path := _safe_resource_path(action.get("path", ""), ["gd"]); var content := action.get("content")
			if script_path.is_empty() or not content is String or content.length() > 1048576: return {"error": "invalid script write"}
			var parsed_script := GDScript.new()
			parsed_script.source_code = content
			if parsed_script.reload() != OK: return {"error": "script parse failed"}
			var absolute := ProjectSettings.globalize_path(script_path); DirAccess.make_dir_recursive_absolute(absolute.get_base_dir())
			var file := FileAccess.open(absolute, FileAccess.WRITE); if file == null: return {"error": "script file could not be opened"}
			file.store_string(content); file.close()
			parsed_script.take_over_path(script_path)
			aliases["__script:" + script_path] = parsed_script
			return {"changed": script_path}
		"script.attach":
			var target := _node(root, aliases, action.get("target")); var script_path := _safe_resource_path(action.get("scriptPath", ""), ["gd"])
			var script: Script = aliases.get("__script:" + script_path) as Script
			if script == null: script = ResourceLoader.load(script_path, "Script", ResourceLoader.CACHE_MODE_IGNORE) as Script
			if target == null or not script is Script: return {"error": "script could not be parsed or attached"}
			target.set_script(script); return {}
		"script.detach":
			var target := _node(root, aliases, action.get("target")); if target == null: return {"error": "node not found"}
			target.set_script(null); return {}
		"signal.connect":
			var source := _node(root, aliases, action.get("source")); var target := _node(root, aliases, action.get("target")); var signal_name := str(action.get("signal", "")); var method := str(action.get("method", ""))
			if source == null or target == null or not source.has_signal(signal_name) or not target.has_method(method): return {"error": "invalid signal contract"}
			var callable := Callable(target, method); if not source.is_connected(signal_name, callable): source.connect(signal_name, callable, CONNECT_PERSIST)
			return {}
		"signal.disconnect":
			var source := _node(root, aliases, action.get("source")); var target := _node(root, aliases, action.get("target")); var signal_name := str(action.get("signal", "")); var method := str(action.get("method", ""))
			if source == null or target == null: return {"error": "invalid signal contract"}
			var callable := Callable(target, method); if source.is_connected(signal_name, callable): source.disconnect(signal_name, callable)
			return {}
		"scene.instantiate":
			var packed := ResourceLoader.load(_safe_resource_path(action.get("path", ""), ["tscn"]), "PackedScene", ResourceLoader.CACHE_MODE_IGNORE); var parent := _node(root, aliases, action.get("parent", "."))
			if not packed is PackedScene or parent == null: return {"error": "invalid scene instantiate"}
			var instance: Node = packed.instantiate(); parent.add_child(instance); instance.owner = root
			if action.has("alias"): aliases[action.alias] = instance
			return {}
		"resource.create":
			var resource_type := str(action.get("resourceType", "")); var resource_path := _safe_resource_path(action.get("path", ""), ["tres", "res"])
			if resource_type not in RESOURCE_TYPES or resource_path.is_empty(): return {"error": "resource type or path is not admitted"}
			var resource := ClassDB.instantiate(resource_type) as Resource
			if action.has("properties"):
				for property in action.properties:
					if not _class_property(resource, property): resource.free(); return {"error": "resource property not found"}
					resource.set(property, _decode(action.properties[property], aliases))
			if ResourceSaver.save(resource, resource_path) != OK: return {"error": "resource save failed"}
			if action.has("alias"): aliases[action.alias] = resource
			return {"changed": resource_path}
		"resource.set_property":
			var resource_path := _safe_resource_path(action.get("path", ""), ["tres", "res"]); var resource := ResourceLoader.load(resource_path, "", ResourceLoader.CACHE_MODE_IGNORE); var property := str(action.get("property", ""))
			if resource == null or not _class_property(resource, property): return {"error": "resource property not found"}
			resource.set(property, _decode(action.get("value"), aliases)); if ResourceSaver.save(resource, resource_path) != OK: return {"error": "resource save failed"}; return {"changed": resource_path}
		"project.input_action.ensure":
			var action_name := str(action.get("name", "")); if not action_name.is_valid_identifier(): return {"error": "invalid input action name"}
			if not InputMap.has_action(action_name): InputMap.add_action(action_name, float(action.get("deadzone", 0.5)))
			ProjectSettings.set_setting("input/" + action_name, {"deadzone": float(action.get("deadzone", 0.5)), "events": []}); ProjectSettings.save(); return {"changed": "res://project.godot"}
		"scene.save": return {}
	return {"error": "unsupported action: %s" % kind}


func _import_asset(action: Dictionary) -> Dictionary:
	var source := str(action.get("sourcePath", ""))
	var target_path := _safe_resource_path(action.get("targetPath", ""))
	if source.is_empty() or target_path.is_empty() or not FileAccess.file_exists(source):
		return {"error": "invalid asset import"}
	var target := ProjectSettings.globalize_path(target_path)
	DirAccess.make_dir_recursive_absolute(target.get_base_dir())
	if DirAccess.copy_absolute(source, target) != OK:
		return {"error": "asset copy failed"}
	return {"changed": target_path}


func _reload_project(input: Dictionary) -> Dictionary:
	EditorInterface.get_resource_filesystem().scan()
	await get_tree().process_frame
	var scene_paths: Variant = input.get("scenePaths", [])
	if not scene_paths is Array or scene_paths.size() > 100:
		return {"status": "rejected", "error": "invalid reload scene list"}
	var reloaded: Array[String] = []
	for scene_value in scene_paths:
		var scene_path := _safe_resource_path(scene_value, ["tscn"])
		if scene_path.is_empty():
			return {"status": "rejected", "error": "invalid reload scene path"}
		if not FileAccess.file_exists(ProjectSettings.globalize_path(scene_path)):
			continue
		if _scene_is_open(scene_path):
			EditorInterface.reload_scene_from_path(scene_path)
		else:
			EditorInterface.open_scene_from_path(scene_path)
		await get_tree().process_frame
		await get_tree().process_frame
		var root := EditorInterface.get_edited_scene_root()
		if root == null or root.scene_file_path != scene_path:
			return {"status": "rejected", "error": "restored scene failed to reopen", "scenePath": scene_path}
		_clean_scene_versions[scene_path] = _scene_version(root)
		reloaded.append(scene_path)
	return {"status": "verified", "reloaded": true, "reloadedScenes": reloaded}


func _start_playtest(input: Dictionary) -> Dictionary:
	if not _active_run.is_empty() and EditorInterface.is_playing_scene(): return {"status": "rejected", "error": "playtest already running"}
	var scene_path := _safe_resource_path(input.get("scenePath", ""), ["tscn"]) if input.get("scenePath") != null else ""
	if scene_path.is_empty(): EditorInterface.play_main_scene()
	else: EditorInterface.play_custom_scene(scene_path)
	_active_run = {"runId": "%s-%s" % [Time.get_ticks_msec(), randi()], "startedAt": Time.get_datetime_string_from_system(true, false) + "Z", "scenePath": scene_path, "events": []}
	return {"status": "started", "runId": _active_run.runId, "startedAt": _active_run.startedAt, "scenePath": scene_path}


func _inspect_playtest(input: Dictionary) -> Dictionary:
	if _active_run.is_empty() or input.get("runId") != _active_run.runId: return {"status": "rejected", "error": "unknown runId"}
	return {"status": "observed", "runId": _active_run.runId, "running": EditorInterface.is_playing_scene(), "events": _active_run.events, "diagnostics": _diagnostics.slice(-200), "nextCursor": null}


func _capture_viewport(input: Dictionary) -> Dictionary:
	if _active_run.is_empty() or input.get("runId") != _active_run.runId: return {"status": "rejected", "error": "unknown runId"}
	if not EditorInterface.is_playing_scene(): return {"status": "rejected", "error": "playtest is not running"}
	if _debugger == null: return {"status": "rejected", "error": "game debugger unavailable"}
	var request_id := int(Time.get_ticks_usec())
	if not _debugger.request_screenshot(request_id): return {"status": "rejected", "error": "active game debugger session unavailable"}
	var started := Time.get_ticks_msec()
	var response: Dictionary = {}
	while Time.get_ticks_msec() - started < SCREENSHOT_TIMEOUT_MSEC:
		response = _debugger.take_response(request_id)
		if not response.is_empty(): break
		await get_tree().process_frame
	if response.is_empty(): return {"status": "rejected", "error": "game viewport capture timed out"}
	var screenshot_path := str(response.get("path", "")).simplify_path()
	var temp_root := OS.get_temp_dir().simplify_path().trim_suffix("/").trim_suffix("\\")
	var normalized_path := screenshot_path.replace("\\", "/")
	var normalized_temp := temp_root.replace("\\", "/") + "/"
	if not normalized_path.to_lower().begins_with(normalized_temp.to_lower()) or not screenshot_path.get_file().begins_with("scr-") or screenshot_path.get_extension().to_lower() != "png":
		return {"status": "rejected", "error": "game screenshot path escaped the engine temp directory"}
	var file := FileAccess.open(screenshot_path, FileAccess.READ)
	if file == null: return {"status": "rejected", "error": "game screenshot file unavailable"}
	if file.get_length() <= 0 or file.get_length() > MAX_SCREENSHOT_BYTES:
		file.close()
		DirAccess.remove_absolute(screenshot_path)
		return {"status": "rejected", "error": "game screenshot size is invalid"}
	var png := file.get_buffer(file.get_length())
	file.close()
	DirAccess.remove_absolute(screenshot_path)
	var hashing := HashingContext.new()
	hashing.start(HashingContext.HASH_SHA256)
	hashing.update(png)
	var digest := hashing.finish().hex_encode()
	return {"status": "captured", "source": "game-debugger", "runId": _active_run.runId, "width": int(response.width), "height": int(response.height), "sha256": digest, "pngBase64": Marshalls.raw_to_base64(png)}


func _stop_playtest(input: Dictionary) -> Dictionary:
	if _active_run.is_empty() or input.get("runId") != _active_run.runId: return {"status": "already-stopped", "runId": input.get("runId")}
	if EditorInterface.is_playing_scene(): EditorInterface.stop_playing_scene()
	var run_id: String = _active_run.runId
	_active_run.clear()
	return {"status": "stopped", "runId": run_id}
