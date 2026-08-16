class_name OpponentFactory
extends RefCounted

## Builds a PvE opponent board that scales with the round number. This is a
## prototype stand-in for real PvP matchmaking — the CombatEngine already treats
## both sides symmetrically, so swapping in a networked opponent later means only
## replacing this factory, not the combat code.

## Returns Array[GameUnit] with board_pos assigned (on the placement grid; the
## engine mirrors them to the enemy half). Deterministic given `rng`.
static func build(round_number: int, rng: DeterministicRng) -> Array:
	# Team size and unit strength grow with the round.
	var team_size: int = clampi(1 + round_number / 2, 1, HexGrid.COLS * HexGrid.ROWS)
	team_size = mini(team_size, 9)
	var max_cost: int = clampi(1 + round_number / 3, 1, 5)
	var star_ceiling: int = 1 if round_number < 6 else (2 if round_number < 12 else 3)

	var units: Array = []
	var used_positions: Dictionary = {}
	var uid := 100000 + round_number * 100
	for i in team_size:
		var cost := rng.randi_range(1, max_cost)
		var candidates: Array = GameDatabase.heroes_of_cost(cost)
		if candidates.is_empty():
			candidates = GameDatabase.heroes_of_cost(1)
		var hero: HeroDef = candidates[rng.randi_below(candidates.size())]
		var star := 1
		if star_ceiling > 1 and rng.chance(0.35):
			star = rng.randi_range(2, star_ceiling)
		var gu := GameUnit.new(uid, hero, star)
		uid += 1
		gu.board_pos = _free_position(used_positions, rng)
		used_positions[gu.board_pos] = true
		units.append(gu)
	return units


static func _free_position(used: Dictionary, rng: DeterministicRng) -> Vector2i:
	# Prefer the front rows so melee opponents actually engage.
	for _attempt in 64:
		var col := rng.randi_below(HexGrid.COLS)
		var row := rng.randi_below(HexGrid.ROWS)
		var p := Vector2i(col, row)
		if not used.has(p):
			return p
	# Fallback linear scan.
	for row in HexGrid.ROWS:
		for col in HexGrid.COLS:
			var p := Vector2i(col, row)
			if not used.has(p):
				return p
	return Vector2i(0, 0)
