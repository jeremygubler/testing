extends Node

## Autoload "GameState" -- der komplette veränderliche Spielstand.
##
## Enthält Team (max. 6), Box-Lager, Inventar, Geld, Story-Flags und die letzte
## Overworld-Position. Alles hier ist serialisierbar: [SaveSystem] macht daraus
## einen Speicherstand, ohne irgendeinen anderen Teil des Spiels zu kennen.
##
## Wichtig: [b]Kein[/b] Szenen-/Node-Wissen in dieser Datei. Die Overworld und
## der Kampf lesen den Zustand, aber der Zustand kennt sie nicht -- deshalb
## lassen sich beide Szenen einzeln starten und testen.

## Version des Speicherformats. Bei Breaking Changes hochzählen und in
## [method from_dict] migrieren.
const SAVE_VERSION: int = 1

signal party_changed()
signal inventory_changed()
signal money_changed(new_amount: int)
signal storage_changed()

## Aktives Team, maximal [method MonsterDatabase.max_party_size] Einträge.
var party: Array[MonsterInstance] = []
## Überzählige Monster ("Box").
var storage: Array[MonsterInstance] = []
## item_id -> Anzahl (Einträge mit 0 werden entfernt).
var inventory: Dictionary = {}
var money: int = 0
## Beliebige Story-/Fortschritts-Flags (String -> Variant).
var flags: Dictionary = {}

var last_scene_path: String = "res://scenes/overworld/Overworld.tscn"
var player_position: Vector3 = Vector3.ZERO
var player_yaw: float = 0.0
var play_time: float = 0.0

## Seed für alles Zufällige außerhalb eines Kampfes (Begegnungen, Talentwerte).
## Wird mitgespeichert, damit ein Spielstand reproduzierbar bleibt.
var world_seed: int = 0
var encounter_rng: RandomNumberGenerator = RandomNumberGenerator.new()

var _initialized: bool = false


func _ready() -> void:
	# Ohne Speicherstand startet ein Standardspiel, damit sowohl Overworld als
	# auch Battle.tscn direkt per F6 lauffähig sind.
	if not _initialized:
		new_game()


func _process(delta: float) -> void:
	play_time += delta


# ---------------------------------------------------------------------------
# Lebenszyklus
# ---------------------------------------------------------------------------

## Setzt alles auf den Startzustand aus `data/game_config.json` zurück.
## [param p_seed] = 0 bedeutet "zufälliger Seed".
func new_game(p_seed: int = 0) -> void:
	party.clear()
	storage.clear()
	inventory.clear()
	flags.clear()
	play_time = 0.0
	player_position = Vector3.ZERO
	player_yaw = 0.0
	world_seed = p_seed if p_seed != 0 else randi()
	encounter_rng = RandomNumberGenerator.new()
	encounter_rng.seed = world_seed
	money = MonsterDatabase.cfg_int("start/money", 0)

	var start_party: Array = MonsterDatabase.cfg("start/party", []) as Array
	for raw in start_party:
		var d: Dictionary = raw as Dictionary
		var mon: MonsterInstance = MonsterInstance.create(
			String(d.get("species_id", "")), int(d.get("level", 5)), encounter_rng)
		add_to_party(mon)

	var start_items: Dictionary = MonsterDatabase.cfg("start/inventory", {}) as Dictionary
	for item_id in start_items.keys():
		add_item(String(item_id), int(start_items[item_id]))

	_initialized = true
	party_changed.emit()
	inventory_changed.emit()
	money_changed.emit(money)


# ---------------------------------------------------------------------------
# Team
# ---------------------------------------------------------------------------

func party_size() -> int:
	return party.size()


func party_is_full() -> bool:
	return party.size() >= MonsterDatabase.max_party_size()


## Nimmt ein Monster ins Team auf; ist das Team voll, geht es in die Box.
## Rückgabe: true, wenn es im *Team* landet.
func add_to_party(monster: MonsterInstance) -> bool:
	if monster == null:
		return false
	if party_is_full():
		send_to_storage(monster)
		return false
	party.append(monster)
	party_changed.emit()
	return true


func send_to_storage(monster: MonsterInstance) -> void:
	if monster == null:
		return
	if storage.size() >= MonsterDatabase.storage_size():
		push_warning("[GameState] Box ist voll -- Monster '%s' verworfen."
			% monster.display_name())
		return
	storage.append(monster)
	storage_changed.emit()


## Entfernt ein Monster aus dem Team (das letzte lässt sich nicht entfernen).
func remove_from_party(index: int) -> MonsterInstance:
	if index < 0 or index >= party.size() or party.size() <= 1:
		return null
	var mon: MonsterInstance = party[index]
	party.remove_at(index)
	party_changed.emit()
	return mon


func swap_party_slots(a: int, b: int) -> void:
	if a == b or a < 0 or b < 0 or a >= party.size() or b >= party.size():
		return
	var tmp: MonsterInstance = party[a]
	party[a] = party[b]
	party[b] = tmp
	party_changed.emit()


func get_party_member(index: int) -> MonsterInstance:
	return party[index] if index >= 0 and index < party.size() else null


func party_leader() -> MonsterInstance:
	var idx: int = first_healthy_index()
	return party[idx] if idx >= 0 else get_party_member(0)


func first_healthy_index() -> int:
	for i in party.size():
		if not party[i].is_fainted():
			return i
	return -1


func has_healthy_monster() -> bool:
	return first_healthy_index() >= 0


## Vollheilung des ganzen Teams (Heilzentrum / Debug-Taste).
func heal_party() -> void:
	for mon in party:
		mon.heal_fully()
	party_changed.emit()


## Kopie des Teams für einen Kampf -- Kämpfe arbeiten auf den *echten*
## Instanzen (Schaden bleibt bestehen), Gegner-Teams dagegen sind Kopien.
func battle_party() -> Array[MonsterInstance]:
	var out: Array[MonsterInstance] = []
	for mon in party:
		out.append(mon)
	return out


# ---------------------------------------------------------------------------
# Inventar
# ---------------------------------------------------------------------------

func add_item(item_id: String, count: int = 1) -> void:
	if item_id == "" or count <= 0:
		return
	if MonsterDatabase.get_item(item_id) == null:
		push_warning("[GameState] Unbekanntes Item '%s' ignoriert." % item_id)
		return
	inventory[item_id] = item_count(item_id) + count
	inventory_changed.emit()


## Rückgabe: true, wenn genug vorhanden war und abgezogen wurde.
func remove_item(item_id: String, count: int = 1) -> bool:
	if item_count(item_id) < count:
		return false
	var left: int = item_count(item_id) - count
	if left <= 0:
		inventory.erase(item_id)
	else:
		inventory[item_id] = left
	inventory_changed.emit()
	return true


func item_count(item_id: String) -> int:
	return int(inventory.get(item_id, 0))


func has_item(item_id: String) -> bool:
	return item_count(item_id) > 0


## Alle Item-IDs mit Bestand, alphabetisch (stabile UI-Reihenfolge).
func inventory_ids() -> Array[String]:
	var out: Array[String] = []
	for k in inventory.keys():
		if int(inventory[k]) > 0:
			out.append(String(k))
	out.sort()
	return out


## Items, die im Kampf benutzbar sind (für das Item-Menü).
func battle_items() -> Array[ItemDefinition]:
	var out: Array[ItemDefinition] = []
	for id in inventory_ids():
		var item: ItemDefinition = MonsterDatabase.get_item(id)
		if item != null and item.usable_in_battle:
			out.append(item)
	return out


func add_money(amount: int) -> void:
	money = maxi(0, money + amount)
	money_changed.emit(money)


func spend_money(amount: int) -> bool:
	if amount > money:
		return false
	add_money(-amount)
	return true


# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------

func set_flag(key: String, value: Variant = true) -> void:
	flags[key] = value


func get_flag(key: String, default_value: Variant = false) -> Variant:
	return flags.get(key, default_value)


# ---------------------------------------------------------------------------
# Serialisierung
# ---------------------------------------------------------------------------

func to_dict() -> Dictionary:
	var party_data: Array = []
	for mon in party:
		party_data.append(mon.to_dict())
	var storage_data: Array = []
	for mon in storage:
		storage_data.append(mon.to_dict())
	return {
		"version": SAVE_VERSION,
		"party": party_data,
		"storage": storage_data,
		"inventory": inventory.duplicate(),
		"money": money,
		"flags": flags.duplicate(true),
		"scene": last_scene_path,
		"position": [player_position.x, player_position.y, player_position.z],
		"yaw": player_yaw,
		"play_time": play_time,
		"world_seed": world_seed,
		"encounter_rng_state": encounter_rng.state,
	}


func from_dict(d: Dictionary) -> void:
	var version: int = int(d.get("version", 0))
	if version > SAVE_VERSION:
		push_warning("[GameState] Speicherstand ist neuer (v%d) als das Spiel (v%d)."
			% [version, SAVE_VERSION])

	party.clear()
	for raw in d.get("party", []):
		party.append(MonsterInstance.from_dict(raw as Dictionary))
	storage.clear()
	for raw in d.get("storage", []):
		storage.append(MonsterInstance.from_dict(raw as Dictionary))

	inventory.clear()
	var inv: Dictionary = d.get("inventory", {}) as Dictionary
	for k in inv.keys():
		inventory[String(k)] = int(inv[k])

	money = int(d.get("money", 0))
	flags = (d.get("flags", {}) as Dictionary).duplicate(true)
	last_scene_path = String(d.get("scene", last_scene_path))

	var pos: Array = d.get("position", [0.0, 0.0, 0.0]) as Array
	if pos.size() >= 3:
		player_position = Vector3(float(pos[0]), float(pos[1]), float(pos[2]))
	player_yaw = float(d.get("yaw", 0.0))
	play_time = float(d.get("play_time", 0.0))

	world_seed = int(d.get("world_seed", 0))
	encounter_rng = RandomNumberGenerator.new()
	encounter_rng.seed = world_seed
	# state wird nach dem seed gesetzt, sonst überschreibt seed den state.
	encounter_rng.state = int(d.get("encounter_rng_state", encounter_rng.state))

	_initialized = true
	party_changed.emit()
	inventory_changed.emit()
	money_changed.emit(money)
	storage_changed.emit()


## Merkt sich, wo der Spieler in der Overworld stand (vor Kampf / Speichern).
func remember_player_transform(scene_path: String, position: Vector3, yaw: float) -> void:
	last_scene_path = scene_path
	player_position = position
	player_yaw = yaw
