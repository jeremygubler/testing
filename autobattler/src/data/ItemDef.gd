class_name ItemDef
extends RefCounted

## Definition of an item, loaded from data_files/items.json.
##
## Two kinds:
##  * component  — a basic item, combinable into a completed item.
##  * completed  — built from a pair of components (recipe), stronger stats.
##
## `stats` is a flat bonus bundle applied to a unit's combat stats. Keys:
## hp, ad, ability_power, as_pct, armor, mr, mana_start, crit, omnivamp.
## (as_pct/crit/omnivamp are fractions, e.g. 0.15 = +15%.)

var id: String
var name: String
var kind: String            # "component" | "completed"
var recipe: Array[String] = []   # two component ids (completed items only)
var stats: Dictionary = {}


static func from_dict(d: Dictionary, kind: String) -> ItemDef:
	var it := ItemDef.new()
	it.id = d.get("id", "")
	it.name = d.get("name", "")
	it.kind = kind
	for c in d.get("recipe", []):
		it.recipe.append(String(c))
	it.stats = d.get("stats", {}).duplicate(true)
	return it


func is_component() -> bool:
	return kind == "component"


## A stable key for a component pair, order-independent (for recipe lookup).
static func recipe_key(comp_a: String, comp_b: String) -> String:
	if comp_a <= comp_b:
		return "%s+%s" % [comp_a, comp_b]
	return "%s+%s" % [comp_b, comp_a]
