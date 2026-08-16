extends Node

## Autoload: loads and indexes all game content from the editable JSON files in
## data_files/. Everything reads content through GameDatabase so balancing is a
## matter of editing JSON, never touching code.
##
## Also owns the shop pool configuration (copies per cost) and shop odds table.

const HEROES_PATH := "res://data_files/heroes.json"
const PERKS_PATH := "res://data_files/perks.json"
const SKINS_PATH := "res://data_files/skins.json"
const CONFIG_PATH := "res://data_files/game_config.json"

var _heroes: Dictionary = {}       # id -> HeroDef
var _heroes_by_cost: Dictionary = {}  # cost(int) -> Array[HeroDef]
var _perks: Dictionary = {}        # id -> PerkDef
var _skins: Dictionary = {}        # id -> SkinDef
var pool_copies: Dictionary = {}   # cost(int) -> copies available in shared pool
var config: Dictionary = {}        # tunable game constants


func _ready() -> void:
	reload()


func reload() -> void:
	_heroes.clear()
	_heroes_by_cost.clear()
	_perks.clear()
	_skins.clear()
	_load_heroes()
	_load_perks()
	_load_skins()
	_load_config()


func _read_json(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		push_error("GameDatabase: missing data file %s" % path)
		return null
	var f := FileAccess.open(path, FileAccess.READ)
	var parsed = JSON.parse_string(f.get_as_text())
	f.close()
	return parsed


func _load_heroes() -> void:
	var d = _read_json(HEROES_PATH)
	if d == null:
		return
	pool_copies = {}
	for k in d.get("pool_copies", {}).keys():
		pool_copies[int(k)] = int(d["pool_copies"][k])
	for hd in d.get("heroes", []):
		var hero := HeroDef.from_dict(hd)
		_heroes[hero.id] = hero
		if not _heroes_by_cost.has(hero.cost):
			_heroes_by_cost[hero.cost] = [] as Array
		_heroes_by_cost[hero.cost].append(hero)


func _load_perks() -> void:
	var d = _read_json(PERKS_PATH)
	if d == null:
		return
	for pd in d.get("perks", []):
		var perk := PerkDef.from_dict(pd)
		_perks[perk.id] = perk


func _load_skins() -> void:
	var d = _read_json(SKINS_PATH)
	if d == null:
		return
	for sd in d.get("skins", []):
		var skin := SkinDef.from_dict(sd)
		_skins[skin.id] = skin


func _load_config() -> void:
	var d = _read_json(CONFIG_PATH)
	config = d if typeof(d) == TYPE_DICTIONARY else {}


# --- Accessors ---------------------------------------------------------------

func get_hero(id: String) -> HeroDef:
	return _heroes.get(id, null)


func all_heroes() -> Array:
	return _heroes.values()


func heroes_of_cost(cost: int) -> Array:
	return _heroes_by_cost.get(cost, [])


func get_perk(id: String) -> PerkDef:
	return _perks.get(id, null)


func all_perks() -> Array:
	return _perks.values()


func get_skin(id: String) -> SkinDef:
	return _skins.get(id, null)


func all_skins() -> Array:
	return _skins.values()


func skins_for_hero(hero_id: String) -> Array:
	var out: Array = []
	for s in _skins.values():
		if s.type == "hero" and s.hero_id == hero_id:
			out.append(s)
	return out


## Config getter with default fallback (so missing config keys never crash).
func cfg(key: String, default: Variant) -> Variant:
	return config.get(key, default)
