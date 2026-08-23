extends Node3D

## Wurzel-Skript der Kampfszene: verdrahtet [BattleManager], [BattleUI] und die
## Platzhalter-Darstellung.
##
## Zwei Startwege:
##   1. [b]Aus der Overworld[/b] -- [GameFlow] hat einen [BattleContext]
##      hinterlegt, der hier abgeholt wird.
##   2. [b]Direkt (F6 im Editor)[/b] -- es gibt keinen Kontext, also baut
##      [method _build_debug_context] einen Testkampf aus den Debug-Feldern
##      unten. Deshalb ist die Kampfszene isoliert testbar.

@export var manager_path: NodePath = ^"BattleManager"
@export var ui_path: NodePath = ^"BattleUI"
@export var player_view_path: NodePath = ^"Stage/PlayerSlot/MonsterView"
@export var enemy_view_path: NodePath = ^"Stage/EnemySlot/MonsterView"

@export_group("Debug-Direktstart")
## Art des Gegners; leer = erste Art der Datenbank.
@export var debug_enemy_species: String = ""
@export_range(1, 100, 1) var debug_enemy_level: int = 6
## Art des Spielermonsters; leer = aktuelles Team aus [GameState].
@export var debug_player_species: String = ""
@export_range(1, 100, 1) var debug_player_level: int = 6
## 0 = zufälliger Seed. Fester Wert => reproduzierbarer Testkampf.
@export var debug_seed: int = 0
## Kampflog zusätzlich auf die Konsole schreiben (praktisch beim Debuggen).
@export var print_log: bool = false

var manager: BattleManager = null
var ui: Node = null
var _player_view: MonsterView = null
var _enemy_view: MonsterView = null


func _ready() -> void:
	manager = get_node_or_null(manager_path) as BattleManager
	ui = get_node_or_null(ui_path)
	_player_view = get_node_or_null(player_view_path) as MonsterView
	_enemy_view = get_node_or_null(enemy_view_path) as MonsterView
	if manager == null:
		push_error("[Battle] Kein BattleManager unter '%s'." % manager_path)
		return

	var ctx: BattleContext = GameFlow.consume_context()
	if ctx == null:
		ctx = _build_debug_context()
		print("[Battle] Debug-Kampf (kein Kontext von GameFlow).")

	if ui != null and ui.has_method("attach"):
		ui.call("attach", manager)
	manager.combatant_changed.connect(_on_combatant_changed)
	manager.hp_changed.connect(_on_hp_changed)
	if print_log:
		manager.message.connect(func(text: String) -> void: print("  " + text))

	manager.start(ctx)


## Baut einen Testkampf, wenn die Szene direkt gestartet wurde.
func _build_debug_context() -> BattleContext:
	var species_ids: Array[String] = MonsterDatabase.species_ids()
	if species_ids.is_empty():
		push_error("[Battle] Keine Arten in der Datenbank.")
		return BattleContext.new()

	var enemy_id: String = debug_enemy_species if debug_enemy_species != "" \
		else species_ids[species_ids.size() - 1]
	var rng := RandomNumberGenerator.new()
	rng.seed = debug_seed if debug_seed != 0 else 20260823
	var enemy: MonsterInstance = MonsterInstance.create(enemy_id, debug_enemy_level, rng)
	var ctx: BattleContext = BattleContext.wild(enemy, debug_seed)
	ctx.return_scene_path = GameFlow.DEFAULT_OVERWORLD

	if debug_player_species != "":
		var mine: MonsterInstance = MonsterInstance.create(
			debug_player_species, debug_player_level, rng)
		ctx.player_party = BattleContext.party_from([mine])
	elif GameState.party.is_empty():
		ctx.player_party = BattleContext.party_from(
			[MonsterInstance.create(species_ids[0], debug_player_level, rng)])
	return ctx


func _on_combatant_changed(side: int, combatant: BattleCombatant) -> void:
	var view: MonsterView = _view_for(side)
	if view != null:
		view.show_monster(combatant.monster)


func _on_hp_changed(side: int, combatant: BattleCombatant) -> void:
	if combatant.is_alive():
		return
	var view: MonsterView = _view_for(side)
	if view != null:
		view.play_faint()


func _view_for(side: int) -> MonsterView:
	return _player_view if side == BattleManager.Side.PLAYER else _enemy_view
