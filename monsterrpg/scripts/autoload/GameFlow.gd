extends Node

## Autoload "GameFlow" -- Szenenwechsel und die Übergabe zwischen Overworld
## und Kampf.
##
## Der Trick, damit beide Szenen einzeln (F6) testbar bleiben: der Kampf-Kontext
## wird *hier* zwischengelagert, nicht als Konstruktor-Argument übergeben.
## Findet [Battle] keinen Kontext, baut es sich selbst einen Debug-Kontext.
##
## Ablauf:
## [codeblock]
## EncounterZone -> GameFlow.start_battle(ctx)   # merkt Position, wechselt Szene
## Battle._ready -> GameFlow.consume_context()   # holt den Kontext ab
## Battle-Ende   -> GameFlow.finish_battle(...)  # zurück in die Overworld
## [/codeblock]

const BATTLE_SCENE: String = "res://scenes/battle/Battle.tscn"
const DEFAULT_OVERWORLD: String = "res://scenes/overworld/Overworld.tscn"
const TITLE_SCENE: String = "res://scenes/Main.tscn"

signal battle_starting(context: BattleContext)
signal battle_finished(result: int, summary: Dictionary)
signal scene_changed(scene_path: String)

## Kontext des nächsten Kampfes (wird von der Battle-Szene abgeholt).
var _pending_context: BattleContext = null
## Kontext des laufenden Kampfes -- liefert das Rückkehrziel.
var _active_context: BattleContext = null
## Ergebnis des letzten Kampfes ([enum BattleManager.Result]).
var last_result: int = BattleManager.Result.ONGOING
var last_summary: Dictionary = {}
## true, während ein Kampf läuft -- die Overworld pausiert dann nichts, sie
## existiert schlicht nicht mehr.
var in_battle: bool = false


## Startet einen Kampf. [param player] darf null sein (z.B. aus einem Skript);
## dann wird die aktuelle Position aus [GameState] weiterverwendet.
func start_battle(ctx: BattleContext, player: Node3D = null) -> void:
	if in_battle:
		return
	if player != null:
		GameState.remember_player_transform(
			_current_scene_path(), player.global_position, player.rotation.y)
	ctx.return_scene_path = GameState.last_scene_path
	_pending_context = ctx
	_active_context = ctx
	in_battle = true
	battle_starting.emit(ctx)
	_change_scene(BATTLE_SCENE)


## Holt den vorbereiteten Kontext ab (einmalig). Null, wenn die Battle-Szene
## direkt gestartet wurde -- dann baut sie sich selbst einen Debug-Kampf.
func consume_context() -> BattleContext:
	var ctx: BattleContext = _pending_context
	_pending_context = null
	return ctx


## Beendet den Kampf und kehrt in die Overworld zurück.
func finish_battle(result: int, summary: Dictionary) -> void:
	last_result = result
	last_summary = summary
	in_battle = false
	battle_finished.emit(result, summary)

	if result == BattleManager.Result.PLAYER_LOST:
		# Niederlage: Team wird geheilt, der Spieler startet am Zonen-Eingang.
		GameState.heal_party()
		GameState.set_flag("last_defeat_turn_count", int(summary.get("turns", 0)))

	# Rückkehrziel aus dem Kontext, sonst die letzte bekannte Overworld.
	var target: String = ""
	if _active_context != null:
		target = _active_context.return_scene_path
	if target == "":
		target = GameState.last_scene_path
	if target == "" or target == BATTLE_SCENE:
		target = DEFAULT_OVERWORLD
	_active_context = null
	_change_scene(target)


func to_overworld() -> void:
	in_battle = false
	var target: String = GameState.last_scene_path
	_change_scene(DEFAULT_OVERWORLD if target == "" else target)


func to_title() -> void:
	in_battle = false
	_change_scene(TITLE_SCENE)


func _change_scene(path: String) -> void:
	if not ResourceLoader.exists(path):
		push_error("[GameFlow] Szene fehlt: %s" % path)
		return
	# call_deferred, damit der Wechsel nie mitten in einem Signal-Callback
	# passiert (sonst räumt Godot Nodes ab, die noch verarbeitet werden).
	get_tree().call_deferred("change_scene_to_file", path)
	scene_changed.emit(path)


func _current_scene_path() -> String:
	var current: Node = get_tree().current_scene
	if current != null and current.scene_file_path != "":
		return current.scene_file_path
	return GameState.last_scene_path
