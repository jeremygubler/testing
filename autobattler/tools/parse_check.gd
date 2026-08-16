extends SceneTree

## Compile/parse check for the whole project. Loads every .gd script under the
## source tree; a script with a parse/compile error fails to load and we report
## it and exit non-zero. This catches syntax errors in ALL scripts (including the
## presentation layer) without needing to instantiate scenes.
##
## Run:  godot --headless --path . -s res://tools/parse_check.gd

func _initialize() -> void:
	var files: Array = []
	for base in ["res://src", "res://tools", "res://tests"]:
		files += _collect(base)
	files.sort()

	var failed := 0
	for f in files:
		if f.ends_with("parse_check.gd"):
			continue
		var res = load(f)
		if res == null:
			push_error("PARSE FAIL: %s" % f)
			print("  FAIL  %s" % f)
			failed += 1
		else:
			print("  ok    %s" % f)

	print("\nparse-check: %d scripts, %d failed" % [files.size(), failed])
	quit(1 if failed > 0 else 0)


func _collect(dir_path: String) -> Array:
	var out: Array = []
	var d := DirAccess.open(dir_path)
	if d == null:
		return out
	d.list_dir_begin()
	var fname := d.get_next()
	while fname != "":
		var full := dir_path.path_join(fname)
		if d.current_is_dir():
			if not fname.begins_with("."):
				out += _collect(full)
		elif fname.ends_with(".gd"):
			out.append(full)
		fname = d.get_next()
	d.list_dir_end()
	return out
