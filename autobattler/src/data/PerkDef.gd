class_name PerkDef
extends RefCounted

## A trait (Perk) definition: origin or class synergy with staged breakpoints.
## Loaded from data_files/perks.json.

var id: String
var name: String
var category: String                  # "origin" | "class"
var description: String
## Each breakpoint: {"count": int, "effect": Dictionary}. Sorted ascending.
var breakpoints: Array = []


static func from_dict(d: Dictionary) -> PerkDef:
	var p := PerkDef.new()
	p.id = d.get("id", "")
	p.name = d.get("name", "")
	p.category = d.get("category", "origin")
	p.description = d.get("description", "")
	p.breakpoints = d.get("breakpoints", []).duplicate(true)
	p.breakpoints.sort_custom(func(a, b): return int(a.get("count", 0)) < int(b.get("count", 0)))
	return p


## Highest breakpoint count reachable by this trait.
func max_count() -> int:
	if breakpoints.is_empty():
		return 0
	return int(breakpoints[-1].get("count", 0))


## Returns the active effect Dictionary for the given number of distinct units
## owning this trait, or {} if no breakpoint is met.
func active_effect(active_count: int) -> Dictionary:
	var effect := {}
	for bp in breakpoints:
		if active_count >= int(bp.get("count", 0)):
			effect = bp.get("effect", {})
	return effect


## The count of the highest met breakpoint (for UI display), or 0.
func active_tier_count(active_count: int) -> int:
	var tier := 0
	for bp in breakpoints:
		var c := int(bp.get("count", 0))
		if active_count >= c:
			tier = c
	return tier
