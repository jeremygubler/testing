extends RefCounted

## Headless composition / trait balance harness (implementation; loaded at runtime
## by tools/comps.gd).
##
## Where balance_impl.gd measures a single hero's raw DPS, this harness measures
## the STRATEGIC layer — traits and whole boards — which is what actually decides a
## TFT-style game. Two deterministic readouts:
##
##   1. Composition tournament: one class-anchored comp per class trait (6 units at
##      2 stars, positioned by role), played round-robin over several seeds with a
##      home/away leg each. Win% surfaces dominant or dead compositions.
##
##   2. Per-trait package value: each trait's comp fought against a fixed,
##      trait-neutral "wall", once with traits applied and once without
##      (CombatEngine apply_traits=false). The offensive delta (damage dealt to the
##      wall) and defensive delta (own surviving-HP fraction) isolate how much each
##      trait package is actually worth in combat, all else equal.
##
## Everything is seed-driven, so the numbers are reproducible balance baselines.

const STAR := 2
const BOARD_SIZE := 6
const SEEDS := [101, 202, 303]
const CENTER_COLS := [3, 2, 4, 1, 5, 0, 6]

# Flags: comps stronger/weaker than this (in win%) are called out.
const STRONG_WINPCT := 58.0
const WEAK_WINPCT := 42.0
# Per-trait deltas above these magnitudes are called out.
const DMG_FLAG := 20.0     # % more/less damage from the trait package
const SURV_FLAG := 12.0    # percentage points of surviving-HP-fraction


func run() -> void:
	GameDatabase.reload()
	_tournament()
	_trait_value()


# --- 1) Composition tournament ----------------------------------------------

func _tournament() -> void:
	print("=== Aetherclash comps: class-anchored tournament (%d units @%d★, round-robin, seeds %s) ===" % [BOARD_SIZE, STAR, str(SEEDS)])

	var comps: Array = []
	for perk in GameDatabase.all_perks():
		if perk.category != "class":
			continue
		var anchor := _heroes_with_trait(perk.id)
		if anchor.size() < 2:
			continue
		var heroes := _fill_to(anchor, BOARD_SIZE)
		comps.append({
			"id": perk.id,
			"name": perk.name,
			"anchor_count": _distinct_with_trait(heroes, perk.id),
			"board": _make_board(heroes, STAR),
			"wins": 0.0,
			"games": 0,
		})

	# Round-robin: every unordered pair, each seed, both home/away legs.
	for i in range(comps.size()):
		for j in range(i + 1, comps.size()):
			for s in SEEDS:
				_duel(comps[i], comps[j], s)
				_duel(comps[j], comps[i], s)

	comps.sort_custom(func(a, b): return _winpct(a) > _winpct(b))

	print("\n%-14s %6s %6s  %s" % ["anchor", "actv", "win%", "flag"])
	for c in comps:
		var flag := ""
		if _winpct(c) >= STRONG_WINPCT:
			flag = "STRONG"
		elif _winpct(c) <= WEAK_WINPCT:
			flag = "weak"
		print("%-14s %6d %6.1f  %s" % [c.name, c.anchor_count, _winpct(c), flag])
	print("  (win%% across %d games each; STRONG >= %.0f, weak <= %.0f)" % [comps[0].games, STRONG_WINPCT, WEAK_WINPCT])


func _duel(home: Dictionary, away: Dictionary, seed_value: int) -> void:
	var engine := CombatEngine.new(home.board, away.board, seed_value)
	var res := engine.run_to_completion()
	var w := int(res.get("winner", -1))
	home.games += 1
	away.games += 1
	if w == 0:
		home.wins += 1.0
	elif w == 1:
		away.wins += 1.0
	else:
		home.wins += 0.5
		away.wins += 0.5


func _winpct(c: Dictionary) -> float:
	if c.games == 0:
		return 0.0
	return 100.0 * c.wins / float(c.games)


# --- 2) Per-trait package value ---------------------------------------------

func _trait_value() -> void:
	print("\n=== Per-trait package value: traits ON vs OFF vs neutral wall (seed avg) ===")
	var wall := _make_board(_wall_board_heroes(), 1)

	var rows: Array = []
	for perk in GameDatabase.all_perks():
		var anchor := _heroes_with_trait(perk.id)
		if anchor.size() < 2:
			continue
		var heroes := _fill_to(anchor, BOARD_SIZE)
		var board := _make_board(heroes, STAR)

		var dmg_on := 0.0
		var dmg_off := 0.0
		var surv_on := 0.0
		var surv_off := 0.0
		for s in SEEDS:
			var on := _measure_vs_wall(board, wall, s, true)
			var off := _measure_vs_wall(board, wall, s, false)
			dmg_on += on.dmg
			dmg_off += off.dmg
			surv_on += on.surv
			surv_off += off.surv
		var n := float(SEEDS.size())
		var dmg_delta := 100.0 * (dmg_on - dmg_off) / maxf(1.0, dmg_off)
		var surv_delta := 100.0 * (surv_on - surv_off) / n

		rows.append({
			"name": perk.name,
			"cat": perk.category,
			"actv": _distinct_with_trait(heroes, perk.id),
			"dmg": dmg_delta,
			"surv": surv_delta,
		})

	rows.sort_custom(func(a, b): return (a.dmg + a.surv) > (b.dmg + b.surv))

	print("\n%-14s %-7s %5s %9s %10s  %s" % ["trait", "cat", "actv", "dmg%", "surv(pp)", "flag"])
	for r in rows:
		var flags: Array = []
		if absf(r.dmg) >= DMG_FLAG:
			flags.append("dmg")
		if absf(r.surv) >= SURV_FLAG:
			flags.append("surv")
		print("%-14s %-7s %5d %+9.1f %+10.1f  %s" % [r.name, r.cat, r.actv, r.dmg, r.surv, ", ".join(flags)])
	print("  (dmg%% = extra damage dealt to the wall with the package on; surv(pp) = surviving-HP-fraction gain)")


## One fight of `board` (team 0) vs the neutral `wall` (team 1). Returns damage
## dealt to the wall and team-0's surviving-HP fraction (own units, excl. summons).
func _measure_vs_wall(board: Array, wall: Array, seed_value: int, traits: bool) -> Dictionary:
	var engine := CombatEngine.new(board, wall, seed_value, {}, traits)
	engine.run_to_completion()
	var dmg := 0.0
	var hp := 0.0
	var max_hp := 0.0
	for u in engine.units:
		if u.team == 1:
			dmg += u.max_hp - u.hp
		elif u.team == 0 and not u.is_summon:
			max_hp += u.max_hp
			if u.alive:
				hp += u.hp
	return {"dmg": dmg, "surv": (hp / max_hp if max_hp > 0.0 else 0.0)}


# --- Comp building -----------------------------------------------------------

func _heroes_with_trait(trait_id: String) -> Array:
	var out: Array = []
	for h in GameDatabase.all_heroes():
		if h.perks.has(trait_id):
			out.append(h)
	out.sort_custom(func(a, b): return a.cost > b.cost)  # strongest anchor first
	return out


func _distinct_with_trait(heroes: Array, trait_id: String) -> int:
	var seen: Dictionary = {}
	for h in heroes:
		if h.perks.has(trait_id):
			seen[h.id] = true
	return seen.size()


## Anchor heroes (already cost-sorted) padded to `size` with deterministic
## mid-cost filler so every comp fights at the same unit count.
func _fill_to(anchor: Array, size: int) -> Array:
	var comp: Array = anchor.duplicate()
	if comp.size() > size:
		comp = comp.slice(0, size)
	var have: Dictionary = {}
	for h in comp:
		have[h.id] = true
	var pool: Array = []
	for h in GameDatabase.all_heroes():
		if not have.has(h.id) and h.cost >= 2 and h.cost <= 3:
			pool.append(h)
	pool.sort_custom(func(a, b): return a.id < b.id)
	var pi := 0
	while comp.size() < size and pi < pool.size():
		comp.append(pool[pi])
		pi += 1
	# Fallback: any remaining hero (only if the mid-cost pool ran dry).
	if comp.size() < size:
		for h in GameDatabase.all_heroes():
			if comp.size() >= size:
				break
			if not have.has(h.id) and not comp.has(h):
				comp.append(h)
	return comp


## Turn a hero list into a positioned board: melee to the front rows, ranged to
## the back, filled center-out for a natural, symmetric formation.
func _make_board(heroes: Array, star: int) -> Array:
	var melee: Array = []
	var ranged: Array = []
	for h in heroes:
		if int(h.attack_range) <= 1:
			melee.append(h)
		else:
			ranged.append(h)
	var board: Array = []
	var uid := 1
	uid = _lay(melee, [0, 1], star, uid, board)
	uid = _lay(ranged, [3, 2], star, uid, board)
	return board


func _lay(heroes: Array, rows: Array, star: int, uid_start: int, out: Array) -> int:
	var uid := uid_start
	var idx := 0
	for h in heroes:
		var ri: int = idx / CENTER_COLS.size()
		var row: int = rows[ri] if ri < rows.size() else rows[rows.size() - 1]
		var col: int = CENTER_COLS[idx % CENTER_COLS.size()]
		var gu := GameUnit.new(uid, h, star)
		gu.board_pos = Vector2i(col, row)
		out.append(gu)
		uid += 1
		idx += 1
	return uid


## A fixed, trait-neutral opponent: six copies of a synthetic bruiser. Because the
## trait rule counts DISTINCT heroes, six identical units activate no trait — so
## the wall stays a constant baseline whether or not traits are applied.
func _wall_board_heroes() -> Array:
	var out: Array = []
	for _i in BOARD_SIZE:
		out.append(_wall_hero())
	return out


func _wall_hero() -> HeroDef:
	var h := HeroDef.new()
	h.id = "balance_wall"
	h.name = "Wall"
	h.cost = 0
	h.hp = 3500.0
	h.attack_damage = 55.0
	h.attack_speed = 0.7
	h.attack_range = 1
	h.armor = 30.0
	h.magic_resist = 30.0
	h.mana_start = 0.0
	h.mana_max = 9999999.0
	h.move_speed = 1.5
	h.attack_type = "physical"
	h.ability_kind = "none"
	h.ability_power = 0.0
	h.ability_radius = 0
	h.ability_duration = 0.0
	return h
