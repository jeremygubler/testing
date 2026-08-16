extends RefCounted

## The actual test suite. Loaded at RUNTIME by tests/TestRunner.gd (never as the
## `-s` entry script) so that autoload singletons (GameDatabase, PlatformServices)
## are already registered and can be referenced directly — the `-s` entry script is
## compiled before autoloads exist, so it must not touch them.

var _passed := 0
var _failed := 0
var _current := ""


## Runs all tests, prints a summary, and returns the number of failures.
func run() -> int:
	GameDatabase.reload()
	_diagnose_rng()

	_run("rng_deterministic", test_rng_deterministic)
	_run("rng_ranges", test_rng_ranges)
	_run("hex_distance", test_hex_distance)
	_run("star_multiplier", test_star_multiplier)
	_run("economy_interest_cap", test_economy_interest_cap)
	_run("economy_streak", test_economy_streak)
	_run("economy_leveling", test_economy_leveling)
	_run("pool_take_give", test_pool_take_give)
	_run("combine_to_two_star", test_combine_to_two_star)
	_run("combat_deterministic", test_combat_deterministic)
	_run("combat_terminates", test_combat_terminates)
	_run("trait_activation", test_trait_activation)

	print("\n== %d passed, %d failed ==" % [_passed, _failed])
	return _failed


# --- Tiny assertion framework ------------------------------------------------

func _run(name: String, fn: Callable) -> void:
	_current = name
	var before_failed := _failed
	fn.call()
	if _failed == before_failed:
		_passed += 1
		print("  PASS  %s" % name)


func _check(cond: bool, msg: String) -> void:
	if not cond:
		_failed += 1
		print("  FAIL  %s: %s" % [_current, msg])


func _eq(a, b, msg: String) -> void:
	_check(a == b, "%s (got %s, expected %s)" % [msg, str(a), str(b)])


func _approx(a: float, b: float, msg: String, eps := 0.0001) -> void:
	_check(absf(a - b) <= eps, "%s (got %f, expected %f)" % [msg, a, b])


# --- Diagnostics -------------------------------------------------------------

func _diagnose_rng() -> void:
	print("DIAG RNG_VERSION=%d (expect 3)" % DeterministicRng.RNG_VERSION)
	var r42 := DeterministicRng.new(42)
	var r43 := DeterministicRng.new(43)
	print("DIAG state42=%s state43=%s" % [str(r42.get_state()), str(r43.get_state())])
	var f42 := r42.next_raw()
	var f43 := r43.next_raw()
	print("DIAG first42=%d first43=%d equal=%s" % [f42, f43, str(f42 == f43)])
	# Manual single-step from raw seed to see the primitive ops in the runtime.
	var a := 42
	var b := (a ^ (a << 13)) & 0xFFFFFFFF
	var c := b ^ (b >> 17)
	var e := (c ^ (c << 5)) & 0xFFFFFFFF
	print("DIAG manual42: a=%d b=%d c=%d e=%d" % [a, b, c, e])
	print("DIAG shifts: (42<<13)=%d (42>>1)=%d (0xFFFFFFFF)=%d" % [42 << 13, 42 >> 1, 0xFFFFFFFF])
	var m: int = 42 * 0x2C1B3C6D
	print("DIAG mult: 42*0x2C1B3C6D=%d masked=%d (python expects 31077305826 / 1012534754)" % [m, m & 0xFFFFFFFF])


# --- Tests -------------------------------------------------------------------

func test_rng_deterministic() -> void:
	var a := DeterministicRng.new(42)
	var b := DeterministicRng.new(42)
	for i in 1000:
		_eq(a.next_raw(), b.next_raw(), "same-seed stream diverged at %d" % i)
		if _failed > 0:
			return
	var c := DeterministicRng.new(43)
	var d := DeterministicRng.new(42)
	_check(c.next_raw() != d.next_raw(), "different seeds gave identical first value")


func test_rng_ranges() -> void:
	var r := DeterministicRng.new(7)
	for i in 5000:
		var v := r.randi_below(10)
		_check(v >= 0 and v < 10, "randi_below out of range: %d" % v)
		if _failed > 0:
			return
	var f := r.randf()
	_check(f >= 0.0 and f < 1.0, "randf out of range: %f" % f)
	var w := r.weighted_index(PackedFloat32Array([0.0, 1.0, 0.0]))
	_eq(w, 1, "weighted_index should pick the only non-zero weight")


func test_hex_distance() -> void:
	_eq(HexGrid.distance(Vector2i(0, 0), Vector2i(0, 0)), 0, "distance to self")
	_eq(HexGrid.distance(Vector2i(0, 0), Vector2i(3, 0)), 3, "horizontal distance")
	_check(HexGrid.distance(Vector2i(0, 0), Vector2i(0, 2)) >= 2, "vertical distance sane")
	for n in HexGrid.neighbors(3, 3):
		_eq(HexGrid.distance(Vector2i(3, 3), n), 1, "neighbour not at distance 1")


func test_star_multiplier() -> void:
	_approx(HeroDef.star_multiplier(1), 1.0, "1-star mult")
	_approx(HeroDef.star_multiplier(2), 1.8, "2-star mult")
	_approx(HeroDef.star_multiplier(3), 3.24, "3-star mult")


func test_economy_interest_cap() -> void:
	var e := Economy.new()
	e.gold = 23
	_eq(e.interest(), 2, "interest at 23 gold")
	e.gold = 50
	_eq(e.interest(), 5, "interest at 50 gold")
	e.gold = 100
	_eq(e.interest(), 5, "interest capped at 5")


func test_economy_streak() -> void:
	var e := Economy.new()
	e.register_result(true)
	e.register_result(true)
	e.register_result(true)
	_eq(e.streak, 3, "win streak counting")
	_eq(e.streak_bonus(), 1, "streak bonus at 3")
	e.register_result(true)
	_eq(e.streak_bonus(), 2, "streak bonus at 4")
	e.register_result(false)
	_eq(e.streak, -1, "streak resets on loss")


func test_economy_leveling() -> void:
	var e := Economy.new()
	_eq(e.level, 1, "start level")
	e.add_xp(2)
	_eq(e.level, 2, "level up to 2 at 2 xp")
	e.gold = 100
	var lvl_before := e.level
	var ok := e.buy_xp()
	_check(ok, "buy_xp should succeed with gold")
	_check(e.level >= lvl_before, "level should not decrease")


func test_pool_take_give() -> void:
	var p := HeroPool.new()
	var hero: HeroDef = GameDatabase.all_heroes()[0]
	var before := p.copies_left(hero.id)
	_check(before > 0, "pool should start with copies")
	_check(p.take(hero.id), "take should succeed")
	_eq(p.copies_left(hero.id), before - 1, "take removes one copy")
	p.give(hero.id, 1)
	_eq(p.copies_left(hero.id), before, "give restores one copy")
	p.give(hero.id, 2)
	_eq(p.copies_left(hero.id), before + 3, "2-star sell returns 3 copies")


func test_combine_to_two_star() -> void:
	var g := GameState.new(1)
	var hero: HeroDef = GameDatabase.heroes_of_cost(1)[0]
	for i in 3:
		var gu := GameUnit.new(1000 + i, hero, 1)
		gu.bench_index = i
		g.roster.append(gu)
	g._combine(hero.id)
	_eq(g.roster.size(), 1, "three 1-stars combine into one unit")
	_eq(g.roster[0].star, 2, "combined unit is 2-star")


func _mirror_team() -> Array:
	var mk := func(uid, hid, col, row):
		var gu := GameUnit.new(uid, GameDatabase.get_hero(hid), 2)
		gu.board_pos = Vector2i(col, row)
		return gu
	return [
		mk.call(1, "gravik", 3, 0),
		mk.call(2, "cinderos", 2, 1),
		mk.call(3, "zephyra", 4, 3),
	]


func test_combat_deterministic() -> void:
	var r1: Dictionary = CombatEngine.new(_mirror_team(), _mirror_team(), 999).run_to_completion()
	var r2: Dictionary = CombatEngine.new(_mirror_team(), _mirror_team(), 999).run_to_completion()
	_eq(r1.winner, r2.winner, "winner must match for same seed")
	_eq(r1.ticks, r2.ticks, "tick count must match for same seed")
	var r3: Dictionary = CombatEngine.new(_mirror_team(), _mirror_team(), 12345).run_to_completion()
	_check(r3.has("winner"), "combat with other seed still produces a result")


func test_combat_terminates() -> void:
	var eng := CombatEngine.new(_mirror_team(), _mirror_team(), 5)
	var r := eng.run_to_completion()
	_check(eng.finished, "combat should finish")
	_check(int(r.ticks) <= 30 * 30 + 1, "combat should not exceed max duration")


func test_trait_activation() -> void:
	var perk: PerkDef = GameDatabase.get_perk("stoneborn")
	_check(perk != null, "stoneborn perk exists")
	var eff := perk.active_effect(2)
	_check(not eff.is_empty(), "stoneborn active at 2 distinct heroes")
	var eff0 := perk.active_effect(1)
	_check(eff0.is_empty(), "stoneborn inactive at 1 hero")
