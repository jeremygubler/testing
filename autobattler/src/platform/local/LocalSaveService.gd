extends ISaveService

## Desktop/development implementation of ISaveService using JSON files under
## user:// (Godot's per-user writable directory). Kept intentionally simple; a
## console port replaces this class entirely.

const _DIR := "user://saves"


func _init() -> void:
	DirAccess.make_dir_recursive_absolute(_DIR)


func _path(key: String) -> String:
	return "%s/%s.json" % [_DIR, key]


func has(key: String) -> bool:
	return FileAccess.file_exists(_path(key))


func save(key: String, data: Dictionary) -> bool:
	var f := FileAccess.open(_path(key), FileAccess.WRITE)
	if f == null:
		push_error("LocalSaveService: cannot write %s" % key)
		return false
	f.store_string(JSON.stringify(data, "\t"))
	f.close()
	return true


func load_data(key: String, default: Dictionary = {}) -> Dictionary:
	if not has(key):
		return default.duplicate(true)
	var f := FileAccess.open(_path(key), FileAccess.READ)
	if f == null:
		return default.duplicate(true)
	var text := f.get_as_text()
	f.close()
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_warning("LocalSaveService: corrupt save '%s', using default" % key)
		return default.duplicate(true)
	return parsed


func erase(key: String) -> bool:
	if has(key):
		DirAccess.remove_absolute(_path(key))
	return true
