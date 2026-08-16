class_name SkinDef
extends RefCounted

## Cosmetic definition (hero skin / board skin / effect skin).
## Purely visual — never affects stats or gameplay (no pay-to-win).
## Loaded from data_files/skins.json.

var id: String
var type: String          # "hero" | "board" | "effect"
var hero_id: String        # for type == "hero"; "" otherwise
var name: String
var rarity: String         # "common" | "rare" | "epic" | "legendary"
var price_tier: String     # maps to store price tier (usually == rarity)
var assets: Dictionary = {}  # arbitrary asset paths/params (sprite, tint, bg, ...)


static func from_dict(d: Dictionary) -> SkinDef:
	var s := SkinDef.new()
	s.id = d.get("id", "")
	s.type = d.get("type", "hero")
	s.hero_id = d.get("hero_id", "")
	s.name = d.get("name", "")
	s.rarity = d.get("rarity", "common")
	s.price_tier = d.get("price_tier", s.rarity)
	s.assets = d.get("assets", {}).duplicate(true)
	return s
