extends SceneTree

## Compile-Check für alle Skripte im Projekt.
##
##     godot --headless --path . -s res://tools/parse_check.gd
##
## Lädt jede .gd-Datei und prüft mit can_instantiate(), ob sie kompiliert.
## Fängt Syntaxfehler auch in Dateien, die zur Laufzeit nie erreicht werden.
## (can_instantiate() statt reload(): kollidiert nicht mit eigenen reload()-
## Methoden und stört keine laufenden Autoload-Instanzen.)

const ROOTS: Array[String] = [
	"res://scripts", "res://ui", "res://scenes", "res://tools", "res://tests",
]


func _initialize() -> void:
	var files: Array[String] = []
	for base in ROOTS:
		files.append_array(_collect(base))
	files.sort()

	var failed: int = 0
	for f in files:
		if f.ends_with("parse_check.gd"):
			continue
		var res: Resource = load(f)
		var ok: bool = res != null
		if res is GDScript:
			ok = (res as GDScript).can_instantiate()
		if ok:
			print("  ok    %s" % f)
		else:
			push_error("PARSE FAIL: %s" % f)
			print("  FAIL  %s" % f)
			failed += 1

	print("\nparse-check: %d Skripte, %d fehlerhaft" % [files.size(), failed])
	quit(1 if failed > 0 else 0)


func _collect(dir_path: String) -> Array[String]:
	var out: Array[String] = []
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return out
	dir.list_dir_begin()
	var entry: String = dir.get_next()
	while entry != "":
		var full: String = dir_path.path_join(entry)
		if dir.current_is_dir():
			if not entry.begins_with("."):
				out.append_array(_collect(full))
		elif entry.ends_with(".gd"):
			out.append(full)
		entry = dir.get_next()
	dir.list_dir_end()
	return out
