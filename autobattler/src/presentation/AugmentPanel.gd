extends CanvasLayer

## Augment selection overlay. Appears when GameState offers augments; the player
## picks one, which applies its effect and dismisses the overlay. Pure
## presentation — it only calls GameState.choose_augment.

const TIER_COLORS := {
	"silver": Color("#c9d1d9"),
	"gold": Color("#ffd24a"),
	"prismatic": Color("#b061ff"),
}

var _game
var _root: PanelContainer
var _btn_box: VBoxContainer


func setup(game_state) -> void:
	_game = game_state
	layer = 6
	_build()
	visible = false
	_game.augments_offered.connect(offer)
	_game.augment_chosen.connect(func(_id): visible = false)


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
	_root.offset_left = -300
	_root.offset_top = -160
	_root.offset_right = 300
	_root.offset_bottom = 160
	add_child(_root)

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 10)
	_root.add_child(vb)

	var title := Label.new()
	title.text = "CHOOSE AN AUGMENT"
	title.add_theme_font_size_override("font_size", 20)
	vb.add_child(title)

	_btn_box = VBoxContainer.new()
	_btn_box.add_theme_constant_override("separation", 8)
	vb.add_child(_btn_box)


func offer(choices: Array) -> void:
	for c in _btn_box.get_children():
		c.queue_free()
	for aug_id in choices:
		var aug: AugmentDef = GameDatabase.get_augment(aug_id)
		if aug == null:
			continue
		var b := Button.new()
		b.custom_minimum_size = Vector2(560, 58)
		b.text = "%s  [%s]\n%s" % [aug.name, aug.tier, aug.description]
		b.add_theme_color_override("font_color", TIER_COLORS.get(aug.tier, Color.WHITE))
		b.pressed.connect(_choose.bind(aug_id))
		_btn_box.add_child(b)
	visible = true


func _choose(aug_id: String) -> void:
	_game.choose_augment(aug_id)
