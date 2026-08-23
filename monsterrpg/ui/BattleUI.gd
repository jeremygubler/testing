extends CanvasLayer

## Kampf-Oberfläche. Hört ausschließlich auf Signale des [BattleManager] und
## schickt [BattleAction]s zurück -- sie enthält keine Spielregeln.
##
## [b]Textpacing[/b]: Der Manager rechnet eine Runde synchron durch und feuert
## dabei alle Log-Zeilen sofort. Die UI puffert sie und zeigt sie im Takt von
## [member line_delay] an; das Aktionsmenü erscheint erst, wenn der Puffer leer
## ist. Mit Leertaste/Enter/A kann man vorspulen.
##
## Erwartete Knoten-Hierarchie (siehe `docs/SCENES.md`) -- fehlt einer, meldet
## [method _bind_nodes] das beim Start.

## Sekunden pro Log-Zeile.
@export_range(0.05, 2.0, 0.05) var line_delay: float = 0.55
## Wie viele Zeilen im Log stehen bleiben.
@export_range(3, 50, 1) var log_lines: int = 6

const P_ENEMY_NAME := "Root/EnemyPanel/Box/NameLabel"
const P_ENEMY_HP := "Root/EnemyPanel/Box/HPBar"
const P_ENEMY_INFO := "Root/EnemyPanel/Box/InfoLabel"
const P_PLAYER_NAME := "Root/PlayerPanel/Box/NameLabel"
const P_PLAYER_HP := "Root/PlayerPanel/Box/HPBar"
const P_PLAYER_INFO := "Root/PlayerPanel/Box/InfoLabel"
const P_LOG := "Root/LogPanel/Margin/LogLabel"
const P_ACTIONS := "Root/ActionPanel"
const P_ACTION_GRID := "Root/ActionPanel/Grid"
const P_SUBMENU := "Root/SubMenu"
const P_SUBMENU_TITLE := "Root/SubMenu/Box/TitleLabel"
const P_SUBMENU_LIST := "Root/SubMenu/Box/List"
const P_SUBMENU_BACK := "Root/SubMenu/Box/BackButton"
const P_RESULT := "Root/ResultPanel"
const P_RESULT_LABEL := "Root/ResultPanel/Box/ResultLabel"
const P_RESULT_BUTTON := "Root/ResultPanel/Box/ContinueButton"

var manager: BattleManager = null

var _enemy_name: Label = null
var _enemy_hp: ProgressBar = null
var _enemy_info: Label = null
var _player_name: Label = null
var _player_hp: ProgressBar = null
var _player_info: Label = null
var _log_label: RichTextLabel = null
var _action_panel: Control = null
var _action_grid: Container = null
var _submenu: Control = null
var _submenu_title: Label = null
var _submenu_list: Container = null
var _submenu_back: Button = null
var _result_panel: Control = null
var _result_label: Label = null
var _result_button: Button = null

var _queue: Array[String] = []
var _lines: Array[String] = []
var _timer: float = 0.0
## Woraufwartet der Kampf gerade? "" | "action" | "forced_switch" | "end"
var _pending_prompt: String = ""
var _end_summary: Dictionary = {}


func _ready() -> void:
	_bind_nodes()
	_hide_all_menus()
	if _submenu_back != null:
		_submenu_back.pressed.connect(_show_action_menu)
	if _result_button != null:
		_result_button.pressed.connect(_on_continue_pressed)


## Verbindet die UI mit einem Kampf. Wird von [Battle] aufgerufen.
func attach(p_manager: BattleManager) -> void:
	manager = p_manager
	manager.message.connect(_on_message)
	manager.awaiting_player_action.connect(_on_awaiting_action)
	manager.awaiting_forced_switch.connect(_on_awaiting_forced_switch)
	manager.combatant_changed.connect(_on_combatant_changed)
	manager.hp_changed.connect(_on_hp_changed)
	manager.status_changed.connect(_on_hp_changed)
	manager.battle_ended.connect(_on_battle_ended)


func _process(delta: float) -> void:
	if _queue.is_empty():
		_maybe_show_prompt()
		return
	_timer -= delta
	if _timer <= 0.0:
		_flush_one()


func _input(event: InputEvent) -> void:
	# Vorspulen: alle gepufferten Zeilen sofort anzeigen.
	if not _queue.is_empty() and event.is_action_pressed("ui_accept"):
		while not _queue.is_empty():
			_flush_one()


# ---------------------------------------------------------------------------
# Signale des Managers
# ---------------------------------------------------------------------------

func _on_message(text: String) -> void:
	_queue.append(text)


func _on_awaiting_action() -> void:
	_pending_prompt = "action"
	_hide_all_menus()
	_refresh_bars()


func _on_awaiting_forced_switch() -> void:
	_pending_prompt = "forced_switch"
	_hide_all_menus()


func _on_combatant_changed(_side: int, _combatant: BattleCombatant) -> void:
	_refresh_bars()


func _on_hp_changed(_side: int, _combatant: BattleCombatant) -> void:
	_refresh_bars()


func _on_battle_ended(result: int, summary: Dictionary) -> void:
	_end_summary = summary
	_pending_prompt = "end"
	_hide_all_menus()
	if _result_label != null:
		_result_label.text = _result_text(result)


func _maybe_show_prompt() -> void:
	match _pending_prompt:
		"action":
			_pending_prompt = ""
			_show_action_menu()
		"forced_switch":
			_pending_prompt = ""
			_show_switch_menu(true)
		"end":
			_pending_prompt = ""
			if _result_panel != null:
				_result_panel.visible = true
			if _result_button != null:
				_result_button.grab_focus()


# ---------------------------------------------------------------------------
# Menüs
# ---------------------------------------------------------------------------

func _hide_all_menus() -> void:
	if _action_panel != null:
		_action_panel.visible = false
	if _submenu != null:
		_submenu.visible = false
	if _result_panel != null:
		_result_panel.visible = false


func _show_action_menu() -> void:
	if manager == null or manager.is_over():
		return
	if _submenu != null:
		_submenu.visible = false
	if _action_panel == null or _action_grid == null:
		return
	_action_panel.visible = true
	_clear(_action_grid)
	_add_button(_action_grid, "Angriff", _show_move_menu)
	var switch_button: Button = _add_button(_action_grid, "Wechsel",
		func() -> void: _show_switch_menu(false))
	switch_button.disabled = manager.available_switch_indices().is_empty()
	var item_button: Button = _add_button(_action_grid, "Item", _show_item_menu)
	item_button.disabled = GameState.battle_items().is_empty()
	var flee_button: Button = _add_button(_action_grid, "Flucht",
		func() -> void: _submit(BattleAction.flee()))
	flee_button.disabled = not manager.can_flee()
	_focus_first(_action_grid)


func _show_move_menu() -> void:
	_open_submenu("Attacke wählen")
	var active: BattleCombatant = manager.player_active()
	for i in active.monster.moves.size():
		var slot: MoveSlot = active.monster.moves[i]
		var move: MoveDefinition = slot.definition()
		if move == null:
			continue
		var label: String = "%s   %s   PP %d/%d" % [
			move.display_name, move.summary(), slot.pp, slot.max_pp()]
		var index: int = i
		var button: Button = _add_button(_submenu_list, label,
			func() -> void: _submit(BattleAction.attack(index)))
		button.disabled = not slot.is_usable()
		button.tooltip_text = move.description
	_focus_first(_submenu_list)


## [param forced] = nach einem K.O.: kein Zurück-Knopf.
func _show_switch_menu(forced: bool) -> void:
	_open_submenu("Monster wechseln")
	if _submenu_back != null:
		_submenu_back.visible = not forced
	for i in manager.player_team.size():
		var c: BattleCombatant = manager.player_team[i]
		var index: int = i
		var button: Button = _add_button(_submenu_list, c.describe(),
			func() -> void: _choose_switch(index, forced))
		button.disabled = not c.is_alive() or i == manager.player_index
	_focus_first(_submenu_list)


func _show_item_menu() -> void:
	_open_submenu("Gegenstand benutzen")
	for item in GameState.battle_items():
		var count: int = GameState.item_count(item.id)
		var item_id: String = item.id
		var kind: int = item.kind
		var button: Button = _add_button(_submenu_list,
			"%s  x%d" % [item.display_name, count],
			func() -> void: _choose_item(item_id, kind))
		button.tooltip_text = item.description
		if kind == ItemDefinition.Kind.CAPTURE and not manager.can_catch():
			button.disabled = true
	_focus_first(_submenu_list)


## Items, die auf ein eigenes Monster wirken, brauchen noch ein Ziel.
func _choose_item(item_id: String, kind: int) -> void:
	if kind == ItemDefinition.Kind.CAPTURE:
		_submit(BattleAction.use_item(item_id, -1))
		return
	_open_submenu("Ziel wählen")
	for i in manager.player_team.size():
		var c: BattleCombatant = manager.player_team[i]
		var index: int = i
		_add_button(_submenu_list, c.describe(),
			func() -> void: _submit(BattleAction.use_item(item_id, index)))
	_focus_first(_submenu_list)


func _choose_switch(index: int, forced: bool) -> void:
	if forced:
		_hide_all_menus()
		manager.submit_forced_switch(index)
	else:
		_submit(BattleAction.switch_to(index))


func _submit(action: BattleAction) -> void:
	_hide_all_menus()
	manager.submit_player_action(action)


func _open_submenu(title: String) -> void:
	if _action_panel != null:
		_action_panel.visible = false
	if _submenu == null:
		return
	_submenu.visible = true
	if _submenu_title != null:
		_submenu_title.text = title
	if _submenu_back != null:
		_submenu_back.visible = true
	_clear(_submenu_list)


# ---------------------------------------------------------------------------
# Anzeige
# ---------------------------------------------------------------------------

func _refresh_bars() -> void:
	if manager == null:
		return
	_apply_combatant(manager.player_active(), _player_name, _player_hp, _player_info, true)
	_apply_combatant(manager.enemy_active(), _enemy_name, _enemy_hp, _enemy_info, false)


func _apply_combatant(c: BattleCombatant, name_label: Label, bar: ProgressBar,
		info: Label, show_exp: bool) -> void:
	if c == null:
		return
	if name_label != null:
		name_label.text = "%s   Lv %d" % [c.name(), c.monster.level]
	if bar != null:
		bar.max_value = float(c.max_hp())
		bar.value = float(c.hp())
		bar.tooltip_text = "%d / %d KP" % [c.hp(), c.max_hp()]
	if info == null:
		return
	var parts: Array[String] = ["%d/%d KP" % [c.hp(), c.max_hp()],
		Elements.labels_of(c.types())]
	if c.status() != StatusAilments.Status.NONE:
		parts.append(StatusAilments.label(c.status()))
	if show_exp:
		parts.append("EP bis Lv %d: %d" % [
			c.monster.level + 1, c.monster.experience_to_next_level()])
	info.text = "   ".join(parts)


func _flush_one() -> void:
	if _queue.is_empty():
		return
	_lines.append(_queue.pop_front())
	while _lines.size() > log_lines:
		_lines.pop_front()
	if _log_label != null:
		_log_label.text = "\n".join(_lines)
	_timer = line_delay
	_refresh_bars()


func _result_text(result: int) -> String:
	match result:
		BattleManager.Result.PLAYER_WON:
			return "Sieg!"
		BattleManager.Result.PLAYER_LOST:
			return "Niederlage ..."
		BattleManager.Result.FLED:
			return "Entkommen."
		BattleManager.Result.CAUGHT:
			return "Gefangen!"
		_:
			return "Kampf beendet (%d Runden)." % int(_end_summary.get("turns", 0))


func _on_continue_pressed() -> void:
	GameFlow.finish_battle(manager.result, _end_summary)


# ---------------------------------------------------------------------------
# Knoten-Anbindung
# ---------------------------------------------------------------------------

func _bind_nodes() -> void:
	_enemy_name = get_node_or_null(P_ENEMY_NAME) as Label
	_enemy_hp = get_node_or_null(P_ENEMY_HP) as ProgressBar
	_enemy_info = get_node_or_null(P_ENEMY_INFO) as Label
	_player_name = get_node_or_null(P_PLAYER_NAME) as Label
	_player_hp = get_node_or_null(P_PLAYER_HP) as ProgressBar
	_player_info = get_node_or_null(P_PLAYER_INFO) as Label
	_log_label = get_node_or_null(P_LOG) as RichTextLabel
	_action_panel = get_node_or_null(P_ACTIONS) as Control
	_action_grid = get_node_or_null(P_ACTION_GRID) as Container
	_submenu = get_node_or_null(P_SUBMENU) as Control
	_submenu_title = get_node_or_null(P_SUBMENU_TITLE) as Label
	_submenu_list = get_node_or_null(P_SUBMENU_LIST) as Container
	_submenu_back = get_node_or_null(P_SUBMENU_BACK) as Button
	_result_panel = get_node_or_null(P_RESULT) as Control
	_result_label = get_node_or_null(P_RESULT_LABEL) as Label
	_result_button = get_node_or_null(P_RESULT_BUTTON) as Button
	var missing: Array[String] = []
	for pair in [
		[P_ENEMY_NAME, _enemy_name], [P_ENEMY_HP, _enemy_hp],
		[P_PLAYER_NAME, _player_name], [P_PLAYER_HP, _player_hp],
		[P_LOG, _log_label], [P_ACTION_GRID, _action_grid],
		[P_SUBMENU_LIST, _submenu_list], [P_RESULT_BUTTON, _result_button],
	]:
		if (pair as Array)[1] == null:
			missing.append(String((pair as Array)[0]))
	if not missing.is_empty():
		push_error("[BattleUI] Fehlende Knoten: %s" % ", ".join(missing))


func _clear(container: Container) -> void:
	if container == null:
		return
	for child in container.get_children():
		container.remove_child(child)
		child.queue_free()


func _add_button(container: Container, text: String, on_pressed: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.focus_mode = Control.FOCUS_ALL
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.pressed.connect(on_pressed)
	if container != null:
		container.add_child(button)
	return button


func _focus_first(container: Container) -> void:
	if container == null:
		return
	for child in container.get_children():
		var button := child as Button
		if button != null and not button.disabled:
			button.grab_focus()
			return
