class_name GameUnit
extends RefCounted

## An owned hero instance the player holds on the bench or board. Carries identity
## (which hero, what star level) and placement. Turned into a CombatUnit when a
## fight starts. Star upgrades happen here (3 of a kind -> next star).

const MAX_ITEMS := 3

var uid: int                    # unique instance id within a game
var hero: HeroDef
var star: int = 1               # 1..3
var board_pos: Vector2i = Vector2i(-1, -1)  # placement hex, or (-1,-1) if benched
var bench_index: int = -1       # slot on the bench, or -1 if on board
var items: Array[String] = []   # equipped item ids (components or completed), max 3


func _init(instance_id: int, hero_def: HeroDef, star_level: int = 1) -> void:
	uid = instance_id
	hero = hero_def
	star = star_level


## Serialize identity + placement + items (JSON-safe). Used by save/load and
## combat replays.
func to_dict() -> Dictionary:
	return {
		"hero": hero.id,
		"star": star,
		"board": [board_pos.x, board_pos.y],
		"bench": bench_index,
		"items": items.duplicate(),
	}


## Reconstruct a GameUnit from to_dict() output. Returns null if the hero id is
## unknown. `instance_id` assigns a fresh uid.
static func from_dict(instance_id: int, d: Dictionary) -> GameUnit:
	var hero_def := GameDatabase.get_hero(String(d.get("hero", "")))
	if hero_def == null:
		hero_def = GameDatabase.get_creep(String(d.get("hero", "")))
	if hero_def == null:
		return null
	var gu := GameUnit.new(instance_id, hero_def, int(d.get("star", 1)))
	var b: Array = d.get("board", [-1, -1])
	gu.board_pos = Vector2i(int(b[0]), int(b[1]))
	gu.bench_index = int(d.get("bench", -1))
	for it in d.get("items", []):
		gu.items.append(String(it))
	return gu


func is_on_board() -> bool:
	return board_pos.x >= 0


## Star-scaled max HP (x1.8 per star).
func max_hp() -> float:
	return hero.hp * HeroDef.star_multiplier(star)


## Star-scaled attack damage.
func attack_damage() -> float:
	return hero.attack_damage * HeroDef.star_multiplier(star)


## Sell value: for the first copy, full purchase cost; higher stars/costs return
## more. Standard rule: value = cost for 1-star, and roughly cost*3^(star-1) - 1
## for upgraded units (minus 1 for cost>1 upgrades, TFT-style). Kept simple here.
func sell_value() -> int:
	if star == 1:
		return hero.cost
	var copies := int(pow(3, star - 1))
	var raw := hero.cost * copies
	return raw - (1 if hero.cost > 1 else 0)
