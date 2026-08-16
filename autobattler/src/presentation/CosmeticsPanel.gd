extends CanvasLayer

## In-game cosmetics store / wardrobe. Lists every skin from the GameDatabase,
## shows ownership + price, and lets the player buy (via IStoreService) and apply
## (via IEntitlementService). Purely presentation — it only talks to the platform
## service interfaces, never a concrete store, so the same screen works unchanged
## once the real eShop backend is swapped in on Switch.

const RARITY_COLORS := {
	"common": Color("#c9d1d9"),
	"rare": Color("#4ea1ff"),
	"epic": Color("#b061ff"),
	"legendary": Color("#ffb347"),
}

var _root: PanelContainer
var _list: VBoxContainer
var _wallet_label: Label


func _ready() -> void:
	layer = 5
	_build()
	visible = false
	var store := PlatformServices.store
	if store != null:
		store.purchase_completed.connect(_on_purchase_completed)


func toggle() -> void:
	visible = not visible
	if visible:
		refresh()


func _build() -> void:
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.6)
	dim.anchor_right = 1.0
	dim.anchor_bottom = 1.0
	add_child(dim)

	_root = PanelContainer.new()
	_root.anchor_left = 0.5
	_root.anchor_top = 0.5
	_root.anchor_right = 0.5
	_root.anchor_bottom = 0.5
	_root.offset_left = -420
	_root.offset_top = -300
	_root.offset_right = 420
	_root.offset_bottom = 300
	add_child(_root)

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 8)
	_root.add_child(vb)

	var header := HBoxContainer.new()
	vb.add_child(header)
	var title := Label.new()
	title.text = "WARDROBE — Cosmetics (visual only, no gameplay effect)"
	title.add_theme_font_size_override("font_size", 18)
	header.add_child(title)
	_wallet_label = Label.new()
	_wallet_label.add_theme_color_override("font_color", Color("#ffd24a"))
	header.add_child(_wallet_label)
	var close_b := Button.new()
	close_b.text = "Close [C]"
	close_b.pressed.connect(toggle)
	header.add_child(close_b)

	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(820, 520)
	vb.add_child(scroll)
	_list = VBoxContainer.new()
	_list.add_theme_constant_override("separation", 4)
	_list.custom_minimum_size = Vector2(800, 0)
	scroll.add_child(_list)


func refresh() -> void:
	for c in _list.get_children():
		c.queue_free()

	var store := PlatformServices.store
	var ent := PlatformServices.entitlements
	if store != null and store.has_method("get_wallet"):
		_wallet_label.text = "   Wallet: CHF %.2f" % store.get_wallet()

	var skins: Array = GameDatabase.all_skins()
	skins.sort_custom(func(a, b): return _sort_key(a) < _sort_key(b))
	for skin in skins:
		_list.add_child(_make_row(skin, store, ent))


func _sort_key(s: SkinDef) -> String:
	# Group by type, then hero, then rarity.
	return "%s|%s|%s|%s" % [s.type, s.hero_id, s.rarity, s.name]


func _make_row(skin: SkinDef, store, ent) -> Control:
	var row := PanelContainer.new()
	var hb := HBoxContainer.new()
	hb.add_theme_constant_override("separation", 10)
	row.add_child(hb)

	var swatch := ColorRect.new()
	swatch.color = RARITY_COLORS.get(skin.rarity, Color.WHITE)
	swatch.custom_minimum_size = Vector2(16, 16)
	hb.add_child(swatch)

	var name_l := Label.new()
	var subject := ""
	if skin.type == "hero":
		var hero := GameDatabase.get_hero(skin.hero_id)
		subject = " — %s" % (hero.name if hero != null else skin.hero_id)
	name_l.text = "%s%s" % [skin.name, subject]
	name_l.custom_minimum_size = Vector2(360, 0)
	hb.add_child(name_l)

	var meta_l := Label.new()
	meta_l.text = "[%s] %s" % [skin.type, skin.rarity]
	meta_l.add_theme_color_override("font_color", RARITY_COLORS.get(skin.rarity, Color.WHITE))
	meta_l.custom_minimum_size = Vector2(160, 0)
	hb.add_child(meta_l)

	var owned: bool = ent != null and ent.owns(skin.id)
	if owned:
		var owned_l := Label.new()
		owned_l.text = "OWNED"
		owned_l.add_theme_color_override("font_color", Color("#5ad469"))
		owned_l.custom_minimum_size = Vector2(120, 0)
		hb.add_child(owned_l)
		if skin.type == "hero":
			var applied: bool = ent.get_applied_skin(skin.hero_id) == skin.id
			var apply_b := Button.new()
			apply_b.text = "Applied ✓" if applied else "Apply"
			apply_b.disabled = applied
			apply_b.pressed.connect(_on_apply.bind(skin))
			hb.add_child(apply_b)
	else:
		var buy_b := Button.new()
		buy_b.text = "Buy  %s" % (store.get_price_display(skin.id) if store != null else "—")
		buy_b.pressed.connect(_on_buy.bind(skin))
		hb.add_child(buy_b)

	return row


func _on_buy(skin: SkinDef) -> void:
	var store := PlatformServices.store
	if store != null:
		store.purchase(skin.id)
	# refresh happens on purchase_completed; refresh now too for the mock's
	# synchronous grant.
	refresh()


func _on_apply(skin: SkinDef) -> void:
	var ent := PlatformServices.entitlements
	if ent != null:
		ent.apply_skin(skin.hero_id, skin.id)
	refresh()


func _on_purchase_completed(_product_id: String, _result: int) -> void:
	if visible:
		refresh()
