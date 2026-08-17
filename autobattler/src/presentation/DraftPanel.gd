extends CanvasLayer

## Draft selection overlay (carousel-style). Appears on a draft round; the player
## picks one of the offered units (each carrying an item component), which is added
## to the bench and resolves the round. Pure presentation — it only calls
## GameState.choose_draft; the round advance is driven by Main via draft_chosen.

const COST_COLORS := {
	1: Color("#c9d1d9"),
	2: Color("#4aa3ff"),
	3: Color("#37c98a"),
	4: Color("#b061ff"),
	5: Color("#ffd24a"),
}

var _game
var _root: PanelContainer
var _btn_box: VBoxContainer


func setup(game_state) -> void:
	_game = game_state
	layer = 6
	_build()
	visible = false
	_game.draft_offered.connect(offer)
	_game.draft_chosen.connect(func(_i): visible = false)


func _build() -> void:
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.72)
	dim.anchor_right = 1.0
	dim.anchor_bottom = 1.0
	add_child(dim)

	_root = PanelContainer.new()
	_root.anchor_left = 0.5
	_root.anchor_top = 0.5
	_root.anchor_right = 0.5
	_root.anchor_bottom = 0.5
	_root.offset_left = -320
	_root.offset_top = -170
	_root.offset_right = 320
	_root.offset_bottom = 170
	add_child(_root)

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 10)
	_root.add_child(vb)

	var title := Label.new()
	title.text = "DRAFT — CHOOSE A FREE UNIT"
	title.add_theme_font_size_override("font_size", 20)
	vb.add_child(title)

	var sub := Label.new()
	sub.text = "Each carries an item component. No fight this round."
	sub.add_theme_color_override("font_color", Color("#8a90a3"))
	vb.add_child(sub)

	_btn_box = VBoxContainer.new()
	_btn_box.add_theme_constant_override("separation", 8)
	vb.add_child(_btn_box)


func offer(choices: Array) -> void:
	for c in _btn_box.get_children():
		c.queue_free()
	for i in choices.size():
		var choice: Dictionary = choices[i]
		var hero: HeroDef = GameDatabase.get_hero(String(choice.get("hero", "")))
		if hero == null:
			continue
		var item: ItemDef = GameDatabase.get_item(String(choice.get("item", "")))
		var item_name := item.name if item != null else "—"
		var b := Button.new()
		b.custom_minimum_size = Vector2(600, 56)
		b.text = "%s  (cost %d)   +  %s" % [hero.name, hero.cost, item_name]
		b.add_theme_color_override("font_color", COST_COLORS.get(hero.cost, Color.WHITE))
		b.pressed.connect(_choose.bind(i))
		_btn_box.add_child(b)
	visible = true


func _choose(index: int) -> void:
	_game.choose_draft(index)
