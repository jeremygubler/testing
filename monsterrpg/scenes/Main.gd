extends Control

## Titelbildschirm und Einstiegspunkt (`run/main_scene`).
##
## Bewusst dumm gehalten: er ruft nur [GameState] / [SaveSystem] / [GameFlow]
## auf. Die Knöpfe existieren vor allem, um die beiden Teile des Spiels
## getrennt starten zu können.

const P_STATUS := "Center/Box/StatusLabel"

var _status: Label = null


func _ready() -> void:
	_status = get_node_or_null(P_STATUS) as Label
	_wire("Center/Box/NewGameButton", _on_new_game)
	_wire("Center/Box/ContinueButton", _on_continue)
	_wire("Center/Box/OverworldButton", _on_overworld)
	_wire("Center/Box/BattleButton", _on_test_battle)
	_wire("Center/Box/QuitButton", _on_quit)
	_refresh_status()


func _wire(path: String, handler: Callable) -> void:
	var button := get_node_or_null(path) as Button
	if button == null:
		push_warning("[Main] Knopf fehlt: %s" % path)
		return
	button.pressed.connect(handler)
	if path.ends_with("ContinueButton"):
		button.disabled = not SaveSystem.has_save(0)


func _refresh_status() -> void:
	if _status == null:
		return
	var info: Dictionary = SaveSystem.peek(0)
	if info.is_empty():
		_status.text = "Kein Speicherstand. %d Arten, %d Attacken geladen." % [
			MonsterDatabase.species_ids().size(), MonsterDatabase.move_ids().size()]
		return
	_status.text = "Slot 0: %d Monster, Anführer Lv %d, %d Münzen" % [
		int(info["party_size"]), int(info["lead_level"]), int(info["money"])]


func _on_new_game() -> void:
	GameState.new_game()
	GameFlow.to_overworld()


func _on_continue() -> void:
	if SaveSystem.load_game(0):
		GameFlow.to_overworld()
	elif _status != null:
		_status.text = "Laden fehlgeschlagen."


func _on_overworld() -> void:
	GameFlow.to_overworld()


## Startet direkt einen Testkampf -- ohne Overworld, praktisch zum Balancing.
func _on_test_battle() -> void:
	var ids: Array[String] = MonsterDatabase.species_ids()
	if ids.is_empty():
		return
	var rng := RandomNumberGenerator.new()
	rng.seed = 12345
	var enemy: MonsterInstance = MonsterInstance.create(ids[ids.size() - 1], 6, rng)
	GameFlow.start_battle(BattleContext.wild(enemy, 4242))


func _on_quit() -> void:
	get_tree().quit()
