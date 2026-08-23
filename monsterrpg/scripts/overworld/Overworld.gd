extends Node3D

## Wurzel-Skript der Overworld-Szene.
##
## Klebt die Teile zusammen, ohne selbst Spielregeln zu enthalten:
##   * Spielerposition aus [GameState] wiederherstellen (Rückkehr aus dem Kampf),
##   * Position laufend zurückschreiben (für Speichern & Kampfstart),
##   * Debug-Tasten: F5 Schnellspeichern, F9 Schnellladen, F1 Testkampf,
##   * Zonen-Signale ans HUD weiterreichen.
##
## Die Szene ist eigenständig lauffähig (F6): [GameState] erzeugt beim Start
## ein Standardteam, [MonsterDatabase] lädt die Inhalte selbst.

## Sekunden zwischen zwei Positions-Updates in den GameState (kein Save!).
const POSITION_SYNC_INTERVAL: float = 0.25

@export var player_path: NodePath = ^"Player"
@export var hud_path: NodePath = ^"OverworldHUD"
## Startpunkt, wenn der Spielstand keine Position kennt.
@export var spawn_point_path: NodePath = ^"SpawnPoint"

var _player: PlayerController = null
var _hud: Node = null
var _sync_timer: float = 0.0


func _ready() -> void:
	_player = get_node_or_null(player_path) as PlayerController
	_hud = get_node_or_null(hud_path)
	GameState.last_scene_path = scene_file_path

	_restore_player_transform()
	_connect_zones()

	if _hud != null and _hud.has_method("show_toast"):
		var flow_result: int = GameFlow.last_result
		if flow_result == BattleManager.Result.PLAYER_LOST:
			_hud.call("show_toast", "Du bist unterlegen -- dein Team wurde geheilt.")
		elif flow_result == BattleManager.Result.CAUGHT:
			_hud.call("show_toast", "Fang erfolgreich!")


func _process(delta: float) -> void:
	_sync_timer += delta
	if _sync_timer >= POSITION_SYNC_INTERVAL:
		_sync_timer = 0.0
		_store_player_transform()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("quick_save"):
		_store_player_transform()
		var ok: bool = SaveSystem.save_game(0)
		_toast("Gespeichert." if ok else "Speichern fehlgeschlagen!")
	elif event.is_action_pressed("quick_load"):
		if SaveSystem.load_game(0):
			_restore_player_transform()
			_toast("Geladen.")
		else:
			_toast("Kein Speicherstand.")
	elif event.is_action_pressed("debug_battle"):
		_start_debug_battle()


# ---------------------------------------------------------------------------
# Position
# ---------------------------------------------------------------------------

func _restore_player_transform() -> void:
	if _player == null:
		return
	if GameState.player_position == Vector3.ZERO:
		var spawn: Node3D = get_node_or_null(spawn_point_path) as Node3D
		if spawn != null:
			_player.global_position = spawn.global_position
			return
	_player.global_position = GameState.player_position
	_player.rotation.y = GameState.player_yaw


func _store_player_transform() -> void:
	if _player == null:
		return
	GameState.remember_player_transform(
		scene_file_path, _player.global_position, _player.rotation.y)


# ---------------------------------------------------------------------------
# Zonen
# ---------------------------------------------------------------------------

func _connect_zones() -> void:
	for ez in encounter_zones():
		ez.player_entered.connect(_on_zone_entered)
		ez.player_exited.connect(_on_zone_exited)
		ez.encounter_triggered.connect(_on_encounter)


## Alle Begegnungszonen unter dieser Szene (rekursiv, typsicher).
func encounter_zones() -> Array[EncounterZone]:
	var out: Array[EncounterZone] = []
	_collect_zones(self, out)
	return out


func _collect_zones(node: Node, out: Array[EncounterZone]) -> void:
	for child in node.get_children():
		if child is EncounterZone:
			out.append(child as EncounterZone)
		_collect_zones(child, out)


func _on_zone_entered(zone: EncounterZone) -> void:
	_toast("Du betrittst: %s" % zone.zone_name)
	if _hud != null and _hud.has_method("set_zone_name"):
		_hud.call("set_zone_name", zone.zone_name)


func _on_zone_exited(_zone: EncounterZone) -> void:
	if _hud != null and _hud.has_method("set_zone_name"):
		_hud.call("set_zone_name", "")


func _on_encounter(monster: MonsterInstance, zone: EncounterZone) -> void:
	print("[Overworld] Begegnung in '%s': %s Lv%d" % [
		zone.zone_name, monster.display_name(), monster.level])


# ---------------------------------------------------------------------------
# Debug
# ---------------------------------------------------------------------------

## F1: startet einen Testkampf gegen ein zufälliges Monster der ersten Zone
## (oder der ersten Art in der Datenbank).
func _start_debug_battle() -> void:
	_store_player_transform()
	var monster: MonsterInstance = null
	for ez in encounter_zones():
		if ez.table != null:
			monster = ez.table.roll_monster(GameState.encounter_rng)
			break
	if monster == null:
		var ids: Array[String] = MonsterDatabase.species_ids()
		if ids.is_empty():
			_toast("Keine Monster in der Datenbank!")
			return
		monster = MonsterInstance.create(ids[0], 5, GameState.encounter_rng)
	GameFlow.start_battle(
		BattleContext.wild(monster, GameState.encounter_rng.randi() | 1), _player)


func _toast(text: String) -> void:
	print("[Overworld] %s" % text)
	if _hud != null and _hud.has_method("show_toast"):
		_hud.call("show_toast", text)
