extends RefCounted

## Implementierung von scene_check.gd (siehe dort).

const SCENE_ROOTS: Array[String] = ["res://scenes", "res://ui"]


func run(tree: SceneTree) -> int:
	var failed: int = 0
	failed += _check_scenes(tree)
	failed += _check_resources()
	print("\nscene-check: %d Fehler" % failed)
	return 1 if failed > 0 else 0


func _check_scenes(tree: SceneTree) -> int:
	var failed: int = 0
	var paths: Array[String] = []
	for root in SCENE_ROOTS:
		paths.append_array(_collect(root, ".tscn"))
	paths.sort()
	for path in paths:
		var packed: PackedScene = load(path) as PackedScene
		if packed == null:
			push_error("SCENE FAIL (laden): %s" % path)
			print("  FAIL  %s" % path)
			failed += 1
			continue
		var node: Node = packed.instantiate()
		if node == null:
			push_error("SCENE FAIL (instanziieren): %s" % path)
			print("  FAIL  %s" % path)
			failed += 1
			continue
		print("  ok    %s  (%d Knoten)" % [path, _count_nodes(node)])
		node.free()
	# tree wird nur benutzt, damit klar ist: hier laufen echte Autoloads.
	if tree.root == null:
		failed += 1
	return failed


func _check_resources() -> int:
	var failed: int = 0
	var expectations: Dictionary = {
		"res://resources/moves": "MoveDefinition",
		"res://resources/monsters": "MonsterSpecies",
		"res://resources/items": "ItemDefinition",
		"res://resources/encounters": "EncounterTable",
	}
	for dir_path in expectations.keys():
		var expected: String = String(expectations[dir_path])
		for path in _collect(String(dir_path), ".tres"):
			var res: Resource = load(path)
			if res == null:
				push_error("RES FAIL (laden): %s" % path)
				print("  FAIL  %s" % path)
				failed += 1
				continue
			if not _matches(res, expected):
				push_error("RES FAIL: %s ist nicht vom Typ '%s'" % [path, expected])
				print("  FAIL  %s" % path)
				failed += 1
			else:
				print("  ok    %s" % path)
	return failed


## Typprüfung ohne Reflexion -- `is` kennt die Klassen zur Compile-Zeit.
func _matches(res: Resource, expected: String) -> bool:
	match expected:
		"MoveDefinition":
			return res is MoveDefinition
		"MonsterSpecies":
			return res is MonsterSpecies
		"ItemDefinition":
			return res is ItemDefinition
		"EncounterTable":
			return res is EncounterTable
		_:
			return false


func _count_nodes(node: Node) -> int:
	var total: int = 1
	for child in node.get_children():
		total += _count_nodes(child)
	return total


func _collect(dir_path: String, suffix: String) -> Array[String]:
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
				out.append_array(_collect(full, suffix))
		elif entry.ends_with(suffix):
			out.append(full)
		entry = dir.get_next()
	dir.list_dir_end()
	return out
