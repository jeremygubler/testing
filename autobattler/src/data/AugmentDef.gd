class_name AugmentDef
extends RefCounted

## Definition of an augment, loaded from data_files/augments.json.
##
## kind == "economy": effects apply to the player's economy (income, interest cap,
##   immediate gold, xp per round).
## kind == "combat":  effects apply to ALL of the player's units each fight
##   (hp_pct, ad_pct, as_pct, armor_add, mr_add, omnivamp, start_shield_pct).

var id: String
var name: String
var tier: String            # "silver" | "gold" | "prismatic"
var kind: String            # "economy" | "combat"
var description: String
var effects: Dictionary = {}


static func from_dict(d: Dictionary) -> AugmentDef:
	var a := AugmentDef.new()
	a.id = d.get("id", "")
	a.name = d.get("name", "")
	a.tier = d.get("tier", "silver")
	a.kind = d.get("kind", "combat")
	a.description = d.get("description", "")
	a.effects = d.get("effects", {}).duplicate(true)
	return a


func is_combat() -> bool:
	return kind == "combat"
