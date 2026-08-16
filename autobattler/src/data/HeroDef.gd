class_name HeroDef
extends RefCounted

## Immutable definition of a hero, loaded from data_files/heroes.json.
## This is pure data — no scene/node references — so the simulation can use it
## headlessly (tests, sandbox, future server-side validation).

var id: String
var name: String
var cost: int
var origin: String
var lore: String
var perks: Array[String] = []          # trait ids this hero belongs to (1-2)

# Base 1-star stats.
var hp: float
var attack_damage: float
var attack_speed: float                 # attacks per second
var attack_range: int                   # in hexes
var armor: float
var magic_resist: float
var mana_start: float
var mana_max: float
var move_speed: float                    # hexes per second
var attack_type: String                  # "physical" | "magic"

# Ability.
var ability_id: String
var ability_name: String
var ability_kind: String                 # burst|nova|heal|shield|empower|execute|summon
var ability_power: float
var ability_radius: int
var ability_duration: float
var ability_description: String


static func from_dict(d: Dictionary) -> HeroDef:
	var h := HeroDef.new()
	h.id = d.get("id", "")
	h.name = d.get("name", "")
	h.cost = int(d.get("cost", 1))
	h.origin = d.get("origin", "")
	h.lore = d.get("lore", "")
	for p in d.get("perks", []):
		h.perks.append(String(p))
	var s: Dictionary = d.get("stats", {})
	h.hp = float(s.get("hp", 500))
	h.attack_damage = float(s.get("attack_damage", 40))
	h.attack_speed = float(s.get("attack_speed", 0.6))
	h.attack_range = int(s.get("attack_range", 1))
	h.armor = float(s.get("armor", 20))
	h.magic_resist = float(s.get("magic_resist", 20))
	h.mana_start = float(s.get("mana_start", 0))
	h.mana_max = float(s.get("mana_max", 100))
	h.move_speed = float(s.get("move_speed", 2.0))
	h.attack_type = s.get("attack_type", "physical")
	var a: Dictionary = d.get("ability", {})
	h.ability_id = a.get("id", "")
	h.ability_name = a.get("name", "")
	h.ability_kind = a.get("kind", "burst")
	h.ability_power = float(a.get("power", 100))
	h.ability_radius = int(a.get("radius", 0))
	h.ability_duration = float(a.get("duration", 0.0))
	h.ability_description = a.get("description", "")
	return h


## Star multiplier for HP and DMG. Agreed scaling: x1.8 per star.
## 1-star -> 1.0, 2-star -> 1.8, 3-star -> 3.24.
static func star_multiplier(star: int) -> float:
	return pow(1.8, star - 1)
