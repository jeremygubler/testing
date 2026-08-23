extends Node

## Autoload "MonsterDatabase" -- zentrale, schreibgeschützte Inhaltsdatenbank.
##
## Aufgaben:
##   * alle .tres-Resources unter `res://resources/` einsammeln und nach ID
##     indexieren (Arten, Attacken, Items, Begegnungstabellen),
##   * die Typenmatrix aus `res://data/type_chart.json` laden,
##   * die Tuning-Werte aus `res://data/game_config.json` bereitstellen.
##
## Warum ein Autoload: Spielstände und Kampfcode referenzieren Inhalte über
## *IDs*, nicht über Dateipfade. Damit bleiben Speicherstände gültig, wenn
## Dateien verschoben werden, und der Kampfcode ist ohne Szene testbar.
##
## Die Datenbank ist bewusst read-only. Alles, was sich im Spiel ändert, lebt
## in [GameState].

## Wurzelordner, die nach Resources durchsucht werden.
const RESOURCE_ROOTS: Array[String] = ["res://resources"]
const TYPE_CHART_PATH: String = "res://data/type_chart.json"
const CONFIG_PATH: String = "res://data/game_config.json"

## Wird ausgelöst, sobald alle Inhalte geladen sind (auch beim Neuladen).
signal database_loaded()

var _species: Dictionary = {}          # String id -> MonsterSpecies
var _moves: Dictionary = {}            # String id -> MoveDefinition
var _items: Dictionary = {}            # String id -> ItemDefinition
var _encounter_tables: Dictionary = {} # String id -> EncounterTable
var _type_chart: Dictionary = {}       # int attacker -> { int defender: float }
var _config: Dictionary = {}
var _loaded: bool = false


func _ready() -> void:
	load_all()


## Lädt (bzw. lädt neu) alle Inhalte. Idempotent -- praktisch für Tests.
func load_all() -> void:
	_species.clear()
	_moves.clear()
	_items.clear()
	_encounter_tables.clear()
	_config = _read_json(CONFIG_PATH)
	_load_type_chart()
	for root in RESOURCE_ROOTS:
		_scan_directory(root)
	_loaded = true
	print("[MonsterDatabase] %d Arten, %d Attacken, %d Items, %d Zonen geladen." % [
		_species.size(), _moves.size(), _items.size(), _encounter_tables.size(),
	])
	database_loaded.emit()


func is_loaded() -> bool:
	return _loaded


# ---------------------------------------------------------------------------
# Zugriff
# ---------------------------------------------------------------------------

func get_species(id: String) -> MonsterSpecies:
	return _species.get(id, null) as MonsterSpecies


func get_move(id: String) -> MoveDefinition:
	return _moves.get(id, null) as MoveDefinition


func get_item(id: String) -> ItemDefinition:
	return _items.get(id, null) as ItemDefinition


func get_encounter_table(id: String) -> EncounterTable:
	return _encounter_tables.get(id, null) as EncounterTable


func species_ids() -> Array[String]:
	return _sorted_keys(_species)


func move_ids() -> Array[String]:
	return _sorted_keys(_moves)


func item_ids() -> Array[String]:
	return _sorted_keys(_items)


func encounter_table_ids() -> Array[String]:
	return _sorted_keys(_encounter_tables)


func all_species() -> Array[MonsterSpecies]:
	var out: Array[MonsterSpecies] = []
	for id in species_ids():
		out.append(_species[id])
	return out


func all_moves() -> Array[MoveDefinition]:
	var out: Array[MoveDefinition] = []
	for id in move_ids():
		out.append(_moves[id])
	return out


func all_items() -> Array[ItemDefinition]:
	var out: Array[ItemDefinition] = []
	for id in item_ids():
		out.append(_items[id])
	return out


# ---------------------------------------------------------------------------
# Konfiguration
# ---------------------------------------------------------------------------

## Liest einen Konfigurationswert über einen Slash-Pfad,
## z.B. [code]cfg("combat/crit_chance", 0.0625)[/code].
## Rückgabetyp ist Variant -- lokale Variablen deshalb IMMER explizit typen.
func cfg(path: String, default_value: Variant) -> Variant:
	var node: Variant = _config
	for part in path.split("/", false):
		if node is Dictionary and (node as Dictionary).has(part):
			node = (node as Dictionary)[part]
		else:
			return default_value
	return node


func cfg_int(path: String, default_value: int) -> int:
	return int(cfg(path, default_value))


func cfg_float(path: String, default_value: float) -> float:
	return float(cfg(path, default_value))


func max_party_size() -> int:
	return cfg_int("party/max_size", 6)


func max_moves() -> int:
	return cfg_int("party/max_moves", 4)


func max_level() -> int:
	return cfg_int("party/max_level", 100)


func storage_size() -> int:
	return cfg_int("party/storage_size", 60)


# ---------------------------------------------------------------------------
# Typenmatrix
# ---------------------------------------------------------------------------

## Effektivität eines Angriffstyps gegen einen Verteidigungstyp.
func type_multiplier(attacker: int, defender: int) -> float:
	var row: Dictionary = _type_chart.get(attacker, {}) as Dictionary
	return float(row.get(defender, 1.0))


## Effektivität gegen ein (ein- oder zweitypiges) Ziel -- Produkt der Einzelwerte.
func type_multiplier_against(attacker: int, defender_types: Array[int]) -> float:
	var mult: float = 1.0
	for t in defender_types:
		mult *= type_multiplier(attacker, t)
	return mult


## Rohe Matrix (zum Debuggen / für Tests).
func type_chart() -> Dictionary:
	return _type_chart.duplicate(true)


func _load_type_chart() -> void:
	_type_chart.clear()
	var data: Dictionary = _read_json(TYPE_CHART_PATH)
	var matrix: Dictionary = data.get("matrix", {}) as Dictionary
	for atk_key in matrix.keys():
		var atk: int = Elements.from_key(String(atk_key))
		if atk == Elements.NONE:
			push_warning("[MonsterDatabase] Unbekannter Angriffstyp '%s'" % atk_key)
			continue
		var row: Dictionary = {}
		var raw_row: Dictionary = matrix[atk_key] as Dictionary
		for def_key in raw_row.keys():
			var dfd: int = Elements.from_key(String(def_key))
			if dfd == Elements.NONE:
				push_warning("[MonsterDatabase] Unbekannter Zieltyp '%s'" % def_key)
				continue
			row[dfd] = float(raw_row[def_key])
		_type_chart[atk] = row


# ---------------------------------------------------------------------------
# Interna
# ---------------------------------------------------------------------------

func _scan_directory(dir_path: String) -> void:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		push_warning("[MonsterDatabase] Ordner nicht lesbar: %s" % dir_path)
		return
	dir.list_dir_begin()
	var entry: String = dir.get_next()
	while entry != "":
		var full: String = dir_path.path_join(entry)
		if dir.current_is_dir():
			if not entry.begins_with("."):
				_scan_directory(full)
		elif _is_resource_file(entry):
			_register(full)
		entry = dir.get_next()
	dir.list_dir_end()


## In exportierten Builds können .tres nach .res konvertiert sein; im Editor
## hängt Godot an importierte Dateien ein ".remap"/".import" an.
func _is_resource_file(file_name: String) -> bool:
	var n: String = file_name.trim_suffix(".remap")
	return n.ends_with(".tres") or n.ends_with(".res")


func _register(path: String) -> void:
	var clean_path: String = path.trim_suffix(".remap")
	var res: Resource = load(clean_path)
	if res == null:
		push_warning("[MonsterDatabase] Konnte Resource nicht laden: %s" % clean_path)
		return
	if res is MonsterSpecies:
		_insert(_species, (res as MonsterSpecies).id, res, clean_path, "Art")
	elif res is MoveDefinition:
		_insert(_moves, (res as MoveDefinition).id, res, clean_path, "Attacke")
	elif res is ItemDefinition:
		_insert(_items, (res as ItemDefinition).id, res, clean_path, "Item")
	elif res is EncounterTable:
		_insert(_encounter_tables, (res as EncounterTable).id, res, clean_path, "Zone")
	# Alles andere (LearnsetEntry, Sub-Resources, Materialien) wird ignoriert.


func _insert(target: Dictionary, id: String, res: Resource, path: String, label: String) -> void:
	if id == "":
		push_warning("[MonsterDatabase] %s ohne ID: %s" % [label, path])
		return
	if target.has(id):
		push_error("[MonsterDatabase] Doppelte %s-ID '%s' (%s)" % [label, id, path])
		return
	target[id] = res


func _read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		push_error("[MonsterDatabase] Datei fehlt: %s" % path)
		return {}
	var text: String = FileAccess.get_file_as_string(path)
	var parsed: Variant = JSON.parse_string(text)
	if parsed is Dictionary:
		return parsed as Dictionary
	push_error("[MonsterDatabase] Ungültiges JSON: %s" % path)
	return {}


func _sorted_keys(d: Dictionary) -> Array[String]:
	var out: Array[String] = []
	for k in d.keys():
		out.append(String(k))
	out.sort()
	return out
