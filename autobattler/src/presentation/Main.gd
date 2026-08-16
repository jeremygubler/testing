extends Node2D

## Presentation layer (b): renders the board/units, drives the shop UI, plays back
## the deterministic combat, and shows results. It NEVER contains game rules — it
## reads GameState and calls its methods. Input flows through the IInputService
## abstraction (PlatformServices.input) so control schemes swap without touching
## this file's game logic.

const HEX_W := 76.0
const HEX_H := 66.0
const HEX_R := 30.0
var BOARD_ORIGIN := Vector2(450, 50)
const BENCH_ORIGIN := Vector2(450, 556)
const BENCH_SLOT := 68.0

const COL_PLAYER := Color("#4ea1ff")
const COL_ENEMY := Color("#ff5d5d")
const COL_HEX := Color("#2a3350")
const COL_HEX_PLAYER := Color("#33406b")
const COL_HEX_HOVER := Color("#586ba8")

var game: GameState
var selected: GameUnit = null
var hovered: Vector2i = Vector2i(-1, -1)  # placement hex under cursor, or (-1,-1)

# Combat playback state.
var _engine: CombatEngine = null
var _opponent: Array = []
var _playing := false
var _sim_accum := 0.0
var _playback_speed := 1.0
var _visual_pos: Dictionary = {}   # slot -> Vector2 (screen), lerped
var _attack_fx: Array = []         # [{from:Vector2, to:Vector2, ttl:float}]
var _result_overlay := ""

# UI references.
var _hud: CanvasLayer
var _cosmetics: CanvasLayer
var _lbl_status: Label
var _lbl_traits: Label
var _shop_buttons: Array = []
var _lbl_shop_state: Label
var _fight_button: Button

# Item tray (held, unassigned items) — left column below the HUD.
const TRAY_ORIGIN := Vector2(16, 210)
const TRAY_W := 210.0
const TRAY_ROW := 26.0
var _sel_item_idx: int = -1   # index into game.item_inventory, or -1


func _ready() -> void:
	game = GameState.new(0x0A17E4C1)  # fixed seed => reproducible session
	_connect_game_signals()
	_connect_input()
	_build_hud()
	_cosmetics = preload("res://src/presentation/CosmeticsPanel.gd").new()
	add_child(_cosmetics)
	game.start_game()
	_refresh_ui()
	queue_redraw()


func _connect_game_signals() -> void:
	game.phase_changed.connect(func(_p): _refresh_ui(); queue_redraw())
	game.roster_changed.connect(func(): _refresh_ui(); queue_redraw())
	game.hp_changed.connect(func(_h): _refresh_ui())
	game.round_changed.connect(func(_r): _refresh_ui())
	game.combat_resolved.connect(_on_combat_resolved)
	game.economy.gold_changed.connect(func(_g): _refresh_ui())
	game.economy.level_changed.connect(func(_l, _x, _n): _refresh_ui())
	game.items_changed.connect(func(): _sel_item_idx = -1; queue_redraw())


func _connect_input() -> void:
	var inp := PlatformServices.input
	inp.action_pressed.connect(_on_action)
	inp.hex_selected.connect(_on_hex_selected)
	inp.hex_pointed.connect(func(c, r): hovered = Vector2i(c, r); queue_redraw())


# --- Input routing (through the platform input interface) --------------------

func _unhandled_input(event: InputEvent) -> void:
	# Debug shortcuts (sandbox/testing convenience).
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_F1:
				game.economy.add_gold(10); _refresh_ui(); return
			KEY_F2:
				var h: HeroDef = GameDatabase.all_heroes().pick_random()
				game.debug_add_unit(h.id); return
			KEY_F3:
				game.player_hp = mini(100, game.player_hp + 10)
				game.hp_changed.emit(game.player_hp); return
			KEY_C:
				_cosmetics.toggle(); return
			KEY_F4:
				var comp: ItemDef = GameDatabase.all_components().pick_random()
				if comp != null:
					game.grant_item(comp.id)
				return

	# Compute the placement hex under the mouse and hand the raw event to the
	# platform input service, which translates it into semantic signals.
	var hex := _pixel_to_placement_hex(get_global_mouse_position())
	PlatformServices.feed_input_event(event, hex)

	# Tray + bench interactions are handled here (their geometry lives in
	# presentation).
	if event is InputEventMouseButton and event.pressed and _in_shop():
		if event.button_index == MOUSE_BUTTON_LEFT:
			var tidx := _pixel_to_tray_index(get_global_mouse_position())
			if tidx >= 0:
				_sel_item_idx = -1 if _sel_item_idx == tidx else tidx
				queue_redraw()
				return
			var bidx := _pixel_to_bench_index(get_global_mouse_position())
			if bidx >= 0:
				_handle_bench_click(bidx)
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			_sell_selected_or_hovered()


func _on_action(action: int) -> void:
	if not _in_shop():
		return
	match action:
		IInputService.Action.REROLL:
			game.reroll()
		IInputService.Action.BUY_XP:
			game.buy_xp()
		IInputService.Action.NEXT:
			_start_combat_playback()
		IInputService.Action.SELL:
			_sell_selected_or_hovered()


func _on_hex_selected(col: int, row: int) -> void:
	if not _in_shop():
		return
	if col < 0:
		return
	var pos := Vector2i(col, row)
	# Assigning a held item to the unit on this hex takes priority.
	if _sel_item_idx >= 0:
		var occ_item := _unit_at_board(pos)
		if occ_item != null:
			_assign_selected_item(occ_item)
		return
	if selected != null:
		game.place_on_board(selected, pos)
		selected = null
	else:
		var occ := _unit_at_board(pos)
		if occ != null:
			selected = occ
	queue_redraw()


func _handle_bench_click(bench_index: int) -> void:
	var unit := _bench_unit_at(bench_index)
	# Assigning a held item to the benched unit takes priority.
	if _sel_item_idx >= 0:
		if unit != null:
			_assign_selected_item(unit)
		return
	if selected != null and unit == null:
		# Move selected board unit back to the bench.
		game.move_to_bench(selected)
		selected = null
	elif unit != null:
		selected = unit if selected != unit else null
	queue_redraw()


func _assign_selected_item(unit: GameUnit) -> void:
	if _sel_item_idx < 0 or _sel_item_idx >= game.item_inventory.size():
		_sel_item_idx = -1
		return
	var item_id: String = game.item_inventory[_sel_item_idx]
	game.assign_item(unit, item_id)  # emits items_changed -> clears selection & redraws


func _sell_selected_or_hovered() -> void:
	var target := selected
	if target == null and hovered.x >= 0:
		target = _unit_at_board(hovered)
	if target != null:
		game.sell(target)
		selected = null
		queue_redraw()


func _in_shop() -> bool:
	return game.phase == GameState.Phase.SHOP


# --- Buying via shop buttons -------------------------------------------------

func _buy_slot(i: int) -> void:
	if _in_shop():
		game.buy(i)


# --- Combat playback ---------------------------------------------------------

func _start_combat_playback() -> void:
	selected = null
	var pack := game.begin_combat_engine()
	_engine = pack.engine
	_opponent = pack.opponent
	_visual_pos.clear()
	for u in _engine.units:
		_visual_pos[u.slot] = _combat_hex_to_pixel(u.pos)
	_attack_fx.clear()
	_result_overlay = ""
	_playing = true
	_refresh_ui()


func _process(delta: float) -> void:
	# Fade attack FX.
	for fx in _attack_fx:
		fx.ttl -= delta
	_attack_fx = _attack_fx.filter(func(f): return f.ttl > 0.0)

	if _playing and _engine != null:
		_sim_accum += delta * _playback_speed
		var tick_len := 1.0 / 30.0
		var steps := 0
		while _sim_accum >= tick_len and not _engine.finished and steps < 10:
			_sim_accum -= tick_len
			_engine.step()
			_consume_events()
			steps += 1
		# Smoothly move visuals toward each unit's current hex.
		for u in _engine.units:
			var target := _combat_hex_to_pixel(u.pos)
			var cur: Vector2 = _visual_pos.get(u.slot, target)
			_visual_pos[u.slot] = cur.lerp(target, clampf(delta * 8.0, 0.0, 1.0))
		if _engine.finished:
			_playing = false
			game.resolve_combat(_engine.result, _opponent)
		queue_redraw()
	elif not _attack_fx.is_empty():
		queue_redraw()


func _consume_events() -> void:
	for ev in _engine.events:
		match ev.get("type", ""):
			"attack", "cast":
				var a: CombatUnit = _find_engine_unit(ev.get("slot", -1))
				var t: CombatUnit = _find_engine_unit(ev.get("target", ev.get("slot", -1)))
				if a != null and t != null:
					_attack_fx.append({
						"from": _visual_pos.get(a.slot, _combat_hex_to_pixel(a.pos)),
						"to": _combat_hex_to_pixel(t.pos),
						"ttl": 0.15,
						"crit": ev.get("type") == "cast",
					})


func _find_engine_unit(slot: int) -> CombatUnit:
	if _engine == null:
		return null
	for u in _engine.units:
		if u.slot == slot:
			return u
	return null


func _on_combat_resolved(result: Dictionary) -> void:
	var winner: int = result.get("winner", -1)
	if winner == 0:
		_result_overlay = "VICTORY  (streak %d)" % game.economy.streak
		var reward: String = result.get("rewards", "")
		if reward != "":
			_result_overlay += "   +  " + reward
	elif winner == 1:
		_result_overlay = "DEFEAT  −%d HP" % result.get("player_damage", 0)
	else:
		_result_overlay = "DRAW"
	if game.phase == GameState.Phase.GAME_OVER:
		_result_overlay = "GAME OVER — reached round %d" % game.round_number
	_refresh_ui()
	queue_redraw()


func _continue_to_next_round() -> void:
	if game.phase == GameState.Phase.RESULT:
		_engine = null
		_result_overlay = ""
		game.begin_next_round()
		queue_redraw()


# --- Coordinate helpers ------------------------------------------------------

func _combat_hex_to_pixel(pos: Vector2i) -> Vector2:
	var x := BOARD_ORIGIN.x + pos.x * HEX_W + (HEX_W * 0.5 if (pos.y & 1) == 1 else 0.0)
	var y := BOARD_ORIGIN.y + pos.y * HEX_H
	return Vector2(x, y)


func _placement_hex_to_pixel(col: int, row: int) -> Vector2:
	# Player placement rows 0..3 map to the bottom half (combat rows 4..7).
	return _combat_hex_to_pixel(Vector2i(col, row + HexGrid.ROWS))


func _pixel_to_placement_hex(p: Vector2) -> Vector2i:
	# Nearest-cell search over the 28 player cells (robust vs. offset math).
	var best := Vector2i(-1, -1)
	var best_d := HEX_R * HEX_R
	for row in HexGrid.ROWS:
		for col in HexGrid.COLS:
			var c := _placement_hex_to_pixel(col, row)
			var d := p.distance_squared_to(c)
			if d < best_d:
				best_d = d
				best = Vector2i(col, row)
	return best


func _pixel_to_bench_index(p: Vector2) -> int:
	for i in GameState.BENCH_SIZE:
		var r := Rect2(BENCH_ORIGIN + Vector2(i * BENCH_SLOT, 0), Vector2(BENCH_SLOT - 6, BENCH_SLOT - 6))
		if r.has_point(p):
			return i
	return -1


func _pixel_to_tray_index(p: Vector2) -> int:
	for i in game.item_inventory.size():
		var r := Rect2(TRAY_ORIGIN + Vector2(0, i * TRAY_ROW), Vector2(TRAY_W, TRAY_ROW - 4))
		if r.has_point(p):
			return i
	return -1


func _unit_at_board(pos: Vector2i) -> GameUnit:
	for u in game.board_units():
		if u.board_pos == pos:
			return u
	return null


func _bench_unit_at(index: int) -> GameUnit:
	for u in game.bench_units():
		if u.bench_index == index:
			return u
	return null


# --- Rendering ---------------------------------------------------------------

func _draw() -> void:
	_draw_board()
	if _playing or game.phase == GameState.Phase.COMBAT or game.phase == GameState.Phase.RESULT:
		_draw_combat_units()
	else:
		_draw_placed_units()
	_draw_bench()
	_draw_attack_fx()
	if not (_playing or game.phase == GameState.Phase.COMBAT):
		_draw_item_tray()
	if _result_overlay != "":
		_draw_center_banner(_result_overlay)


func _draw_board() -> void:
	for row in HexGrid.COMBAT_ROWS:
		for col in HexGrid.COLS:
			var center := _combat_hex_to_pixel(Vector2i(col, row))
			var is_player_zone := row >= HexGrid.ROWS
			var base := COL_HEX_PLAYER if is_player_zone else COL_HEX
			if _in_shop() and is_player_zone and Vector2i(col, row - HexGrid.ROWS) == hovered:
				base = COL_HEX_HOVER
			_draw_hex(center, base, is_player_zone and _in_shop())


func _draw_hex(center: Vector2, fill: Color, highlight: bool) -> void:
	var pts := PackedVector2Array()
	for i in 6:
		var ang := deg_to_rad(60.0 * i - 30.0)
		pts.append(center + Vector2(cos(ang), sin(ang)) * HEX_R)
	draw_colored_polygon(pts, fill)
	var outline := pts
	outline.append(pts[0])
	draw_polyline(outline, Color(1, 1, 1, 0.12 if not highlight else 0.35), 2.0)


func _draw_placed_units() -> void:
	for u in game.board_units():
		var c := _placement_hex_to_pixel(u.board_pos.x, u.board_pos.y)
		_draw_unit_token(c, u.hero.name, u.star, u.hero.cost, COL_PLAYER, u == selected, 1.0, 1.0, 1.0)
		_draw_item_pips(c, u)


## Small squares under a unit token, one per equipped item (bright = completed).
func _draw_item_pips(center: Vector2, u: GameUnit) -> void:
	for i in u.items.size():
		var item: ItemDef = GameDatabase.get_item(u.items[i])
		var col := Color("#ffd24a") if (item != null and not item.is_component()) else Color("#8fa1c7")
		var p := center + Vector2(-15 + i * 12, HEX_R * 0.78)
		draw_rect(Rect2(p, Vector2(9, 9)), col)
		draw_rect(Rect2(p, Vector2(9, 9)), Color(0, 0, 0, 0.6), false, 1.0)


func _draw_combat_units() -> void:
	if _engine == null:
		return
	for u in _engine.units:
		if not u.alive:
			continue
		var c: Vector2 = _visual_pos.get(u.slot, _combat_hex_to_pixel(u.pos))
		var col := COL_PLAYER if u.team == 0 else COL_ENEMY
		var hp_frac := clampf(u.hp / u.max_hp, 0.0, 1.0)
		var mana_frac := clampf(u.mana / u.mana_max, 0.0, 1.0) if u.mana_max > 0 else 0.0
		var hdef := GameDatabase.get_hero(u.hero_id)
		var label := (hdef.name if hdef != null else "?")
		if u.is_summon:
			label = "+"
		_draw_unit_token(c, label, u.star, 0, col, false, hp_frac, mana_frac, 1.0)


func _draw_unit_token(center: Vector2, label: String, star: int, cost: int,
		col: Color, is_selected: bool, hp_frac: float, mana_frac: float, _scale: float) -> void:
	draw_circle(center, HEX_R * 0.7, col.darkened(0.2))
	draw_arc(center, HEX_R * 0.7, 0, TAU, 24, col.lightened(0.2), 3.0)
	if is_selected:
		draw_arc(center, HEX_R * 0.85, 0, TAU, 28, Color("#ffe066"), 3.0)
	var font := ThemeDB.fallback_font
	var ch := label.substr(0, 1).to_upper()
	draw_string(font, center + Vector2(-7, 6), ch, HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color.WHITE)
	# HP bar.
	var bar_w := HEX_R * 1.4
	var bar_pos := center + Vector2(-bar_w * 0.5, -HEX_R * 0.95)
	draw_rect(Rect2(bar_pos, Vector2(bar_w, 6)), Color(0, 0, 0, 0.6))
	draw_rect(Rect2(bar_pos, Vector2(bar_w * hp_frac, 6)), Color("#5ad469"))
	if mana_frac > 0.0:
		var mpos := bar_pos + Vector2(0, 7)
		draw_rect(Rect2(mpos, Vector2(bar_w, 4)), Color(0, 0, 0, 0.6))
		draw_rect(Rect2(mpos, Vector2(bar_w * mana_frac, 4)), Color("#49b6ff"))
	# Star pips.
	for s in star:
		draw_circle(center + Vector2(-8 + s * 8, HEX_R * 0.55), 3.5, Color("#ffd24a"))


func _draw_bench() -> void:
	for i in GameState.BENCH_SIZE:
		var pos := BENCH_ORIGIN + Vector2(i * BENCH_SLOT, 0)
		draw_rect(Rect2(pos, Vector2(BENCH_SLOT - 6, BENCH_SLOT - 6)), Color("#1c2540"))
		draw_rect(Rect2(pos, Vector2(BENCH_SLOT - 6, BENCH_SLOT - 6)), Color(1, 1, 1, 0.1), false, 1.5)
	for u in game.bench_units():
		if u.bench_index < 0 or u.bench_index >= GameState.BENCH_SIZE:
			continue
		var c := BENCH_ORIGIN + Vector2(u.bench_index * BENCH_SLOT + (BENCH_SLOT - 6) * 0.5, (BENCH_SLOT - 6) * 0.5)
		_draw_unit_token(c, u.hero.name, u.star, u.hero.cost, COL_PLAYER.darkened(0.1), u == selected, 1.0, 0.0, 1.0)
		_draw_item_pips(c, u)


func _draw_item_tray() -> void:
	var font := ThemeDB.fallback_font
	if not game.item_inventory.is_empty():
		draw_string(font, TRAY_ORIGIN + Vector2(0, -6), "ITEMS (click, then a unit)",
			HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color("#7f8bb0"))
	for i in game.item_inventory.size():
		var item: ItemDef = GameDatabase.get_item(game.item_inventory[i])
		var top := TRAY_ORIGIN + Vector2(0, i * TRAY_ROW)
		var rect := Rect2(top, Vector2(TRAY_W, TRAY_ROW - 4))
		var bg := Color("#2a3350") if i != _sel_item_idx else Color("#586ba8")
		draw_rect(rect, bg)
		draw_rect(rect, Color(1, 1, 1, 0.12), false, 1.0)
		var is_comp: bool = item != null and item.is_component()
		var swatch := Color("#8fa1c7") if is_comp else Color("#ffd24a")
		draw_rect(Rect2(top + Vector2(5, 5), Vector2(TRAY_ROW - 14, TRAY_ROW - 14)), swatch)
		var nm := item.name if item != null else "?"
		draw_string(font, top + Vector2(TRAY_ROW, TRAY_ROW - 9), nm,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color.WHITE)


func _draw_attack_fx() -> void:
	for fx in _attack_fx:
		var a: float = clampf(fx.ttl / 0.15, 0.0, 1.0)
		var col := Color("#b061ff") if fx.get("crit", false) else Color("#ffd24a")
		col.a = a
		draw_line(fx.from, fx.to, col, 3.0 if fx.get("crit", false) else 2.0)


func _draw_center_banner(text: String) -> void:
	var font := ThemeDB.fallback_font
	var size := 40
	var w := font.get_string_size(text, HORIZONTAL_ALIGNMENT_CENTER, -1, size).x
	var pos := Vector2(get_viewport_rect().size.x * 0.5 - w * 0.5, 360)
	draw_rect(Rect2(pos + Vector2(-20, -40), Vector2(w + 40, 60)), Color(0, 0, 0, 0.7))
	draw_string(font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, Color("#ffe066"))


# --- HUD ---------------------------------------------------------------------

func _build_hud() -> void:
	_hud = CanvasLayer.new()
	add_child(_hud)

	var panel := PanelContainer.new()
	panel.position = Vector2(16, 16)
	panel.custom_minimum_size = Vector2(390, 0)
	_hud.add_child(panel)
	var vb := VBoxContainer.new()
	panel.add_child(vb)

	var title := Label.new()
	title.text = "AETHERCLASH — Auto-Battler Prototype"
	title.add_theme_font_size_override("font_size", 18)
	vb.add_child(title)

	_lbl_status = Label.new()
	_lbl_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vb.add_child(_lbl_status)

	_lbl_traits = Label.new()
	_lbl_traits.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_lbl_traits.add_theme_color_override("font_color", Color("#9fd0ff"))
	vb.add_child(_lbl_traits)

	var help := Label.new()
	help.text = "[D] reroll (2g)   [F] buy XP (4g)   [Space] fight   Right-click: sell\nClick shop to buy · click unit then a hex to place · click bench to move\nItems: click a tray item then a unit (2 components combine). Debug: F1 gold · F2 unit · F4 item"
	help.add_theme_color_override("font_color", Color("#7f8bb0"))
	help.add_theme_font_size_override("font_size", 11)
	vb.add_child(help)

	# Shop bar at the bottom.
	var shop_box := HBoxContainer.new()
	shop_box.position = Vector2(16, 648)
	shop_box.add_theme_constant_override("separation", 8)
	_hud.add_child(shop_box)
	for i in 5:
		var b := Button.new()
		b.custom_minimum_size = Vector2(150, 60)
		b.pressed.connect(_buy_slot.bind(i))
		shop_box.add_child(b)
		_shop_buttons.append(b)

	# Right-side control buttons.
	var ctl := VBoxContainer.new()
	ctl.position = Vector2(1120, 120)
	_hud.add_child(ctl)
	var reroll_b := Button.new()
	reroll_b.text = "Reroll (2g)"
	reroll_b.pressed.connect(_on_reroll_pressed)
	ctl.add_child(reroll_b)
	var xp_b := Button.new()
	xp_b.text = "Buy XP (4g)"
	xp_b.pressed.connect(_on_xp_pressed)
	ctl.add_child(xp_b)
	_fight_button = Button.new()
	_fight_button.text = "FIGHT"
	_fight_button.pressed.connect(_on_fight_pressed)
	ctl.add_child(_fight_button)

	var cos_b := Button.new()
	cos_b.text = "Wardrobe [C]"
	cos_b.pressed.connect(_on_wardrobe_pressed)
	ctl.add_child(cos_b)

	_lbl_shop_state = Label.new()
	ctl.add_child(_lbl_shop_state)


func _on_fight_pressed() -> void:
	if _in_shop():
		_start_combat_playback()
	elif game.phase == GameState.Phase.RESULT:
		_continue_to_next_round()


func _on_reroll_pressed() -> void:
	if _in_shop():
		game.reroll()


func _on_xp_pressed() -> void:
	if _in_shop():
		game.buy_xp()


func _on_wardrobe_pressed() -> void:
	_cosmetics.toggle()


func _refresh_ui() -> void:
	if _lbl_status == null:
		return
	var e := game.economy
	_lbl_status.text = "Round %d   HP %d   Gold %d   Lvl %d (%d/%d XP)   Board %d/%d   Interest +%d   Streak %d" % [
		game.round_number, game.player_hp, e.gold, e.level, e.xp,
		e.xp + e.xp_to_next(), game.board_count(), e.board_capacity(), e.interest(), e.streak]
	_lbl_traits.text = "Traits: " + _active_traits_text()

	for i in _shop_buttons.size():
		var b: Button = _shop_buttons[i]
		var hero: HeroDef = game.shop.offers[i] if i < game.shop.offers.size() else null
		if hero == null:
			b.text = "—"
			b.disabled = true
		else:
			b.text = "%s\n%dg  [%s/%s]" % [hero.name, hero.cost,
				_short(hero.perks[0]), _short(hero.perks[1]) if hero.perks.size() > 1 else "-"]
			b.disabled = not (_in_shop() and e.can_afford(hero.cost))

	if game.phase == GameState.Phase.RESULT:
		_fight_button.text = "NEXT ROUND"
	elif game.phase == GameState.Phase.GAME_OVER:
		_fight_button.text = "GAME OVER"
		_fight_button.disabled = true
	else:
		_fight_button.text = "FIGHT"
		_fight_button.disabled = not _in_shop()


func _active_traits_text() -> String:
	# Count distinct heroes per trait on the board.
	var distinct: Dictionary = {}
	for u in game.board_units():
		for t in u.hero.perks:
			if not distinct.has(t):
				distinct[t] = {}
			distinct[t][u.hero.id] = true
	var parts: Array = []
	var keys := distinct.keys()
	keys.sort()
	for t in keys:
		var perk: PerkDef = GameDatabase.get_perk(t)
		if perk == null:
			continue
		var count: int = distinct[t].size()
		var tier := perk.active_tier_count(count)
		var marker := "●" if tier > 0 else "○"
		parts.append("%s %s %d" % [marker, perk.name, count])
	return "  ".join(parts) if not parts.is_empty() else "(none)"


func _short(trait_id: String) -> String:
	var p: PerkDef = GameDatabase.get_perk(trait_id)
	return p.name if p != null else trait_id
