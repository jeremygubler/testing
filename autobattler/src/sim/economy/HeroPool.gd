class_name HeroPool
extends RefCounted

## The shared champion pool. Every player draws from and returns to the same pool,
## so buying a hero makes it rarer for everyone (classic auto-battler scarcity).
## Copies per cost come from GameDatabase.pool_copies.

var _remaining: Dictionary = {}   # hero_id -> copies left


func _init() -> void:
	reset()


func reset() -> void:
	_remaining.clear()
	for hero in GameDatabase.all_heroes():
		var copies := int(GameDatabase.pool_copies.get(hero.cost, 1))
		_remaining[hero.id] = copies


func copies_left(hero_id: String) -> int:
	return _remaining.get(hero_id, 0)


## Total copies remaining for a given cost tier (used for weighting).
func copies_left_of_cost(cost: int) -> int:
	var total := 0
	for hero in GameDatabase.heroes_of_cost(cost):
		total += _remaining.get(hero.id, 0)
	return total


## Remove one copy when a hero is bought. Returns false if none left.
func take(hero_id: String) -> bool:
	if _remaining.get(hero_id, 0) <= 0:
		return false
	_remaining[hero_id] -= 1
	return true


## Return copies to the pool when a hero is sold (star level = number of 1-star
## copies represented: 1-star=1, 2-star=3, 3-star=9).
func give(hero_id: String, star: int = 1) -> void:
	var count := int(pow(3, star - 1))
	_remaining[hero_id] = _remaining.get(hero_id, 0) + count


func snapshot() -> Dictionary:
	return _remaining.duplicate()


func restore(state: Dictionary) -> void:
	_remaining = state.duplicate()
