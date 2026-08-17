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
	_run("item_combine", test_item_combine)
	_run("item_stats_in_combat", test_item_stats_in_combat)
	_run("round_rewards", test_round_rewards)
	_run("augment_economy", test_augment_economy)
	_run("augment_combat_mods", test_augment_combat_mods)
	_run("save_load_roundtrip", test_save_load_roundtrip)
	_run("augment_offer", test_augment_offer)
	_run("creep_round_opponent", test_creep_round_opponent)
	_run("creep_round_reward", test_creep_round_reward)
	_run("combat_replay", test_combat_replay)
	_run("ability_params_loaded", test_ability_params_loaded)
	_run("trait_toggle_affects_combat", test_trait_toggle_affects_combat)
	_run("full_run_completes", test_full_run_completes)
	_run("stall_breaker_resolves_stalls", test_stall_breaker_resolves_stalls)
	_run("ability_damage_tracked", test_ability_damage_tracked)
	_run("recipe_grid_complete", test_recipe_grid_complete)
	_run("augment_new_effects", test_augment_new_effects)

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


func test_item_combine() -> void:
	var g := GameState.new(2)
	var hero: HeroDef = GameDatabase.heroes_of_cost(1)[0]
	var gu := GameUnit.new(5000, hero, 1)
	gu.bench_index = 0
	g.roster.append(gu)
	g.grant_item("blade")
	g.grant_item("bow")
	_check(g.assign_item(gu, "blade"), "equip first component")
	_eq(gu.items.size(), 1, "one component equipped")
	_check(g.assign_item(gu, "bow"), "assign second component")
	_eq(gu.items.size(), 1, "components combine into a single item")
	_eq(gu.items[0], "duelistedge", "blade + bow => Duelist's Edge")
	_check(g.item_inventory.is_empty(), "both components consumed from inventory")


func test_item_stats_in_combat() -> void:
	var hero: HeroDef = GameDatabase.get_hero("gravik")
	var base := GameUnit.new(6000, hero, 1)
	base.board_pos = Vector2i(0, 0)
	var equipped := GameUnit.new(6001, hero, 1)
	equipped.board_pos = Vector2i(0, 0)
	equipped.items = ["titanheart"]  # +450 hp
	var cu_base := CombatUnit.from_game_unit(base, 0, Vector2i(0, 4), 0)
	var cu_item := CombatUnit.from_game_unit(equipped, 0, Vector2i(0, 4), 1)
	_approx(cu_item.max_hp - cu_base.max_hp, 450.0, "Titan Heart adds +450 max HP", 0.5)
	_approx(cu_item.hp, cu_item.max_hp, "unit starts at full (item-boosted) HP", 0.5)


func test_round_rewards() -> void:
	# Round 3 has a scheduled component drop and is NOT a creep round, so a win
	# drops exactly one component + the win gold bonus.
	var g := GameState.new(3)
	g.round_number = 3
	var gold_before := g.economy.gold
	var items_before := g.item_inventory.size()
	g._resolve_combat({"winner": 0, "surviving_stars": [0, 0]}, [])
	_eq(g.item_inventory.size(), items_before + 1, "round-3 win drops one component")
	_check(g.economy.gold >= gold_before + 1, "win grants at least the gold bonus")
	# A loss drops nothing.
	var g2 := GameState.new(3)
	g2.round_number = 3
	var inv2 := g2.item_inventory.size()
	g2._resolve_combat({"winner": 1, "surviving_stars": [0, 1]}, [])
	_eq(g2.item_inventory.size(), inv2, "a loss drops no items")


func test_augment_economy() -> void:
	var g := GameState.new(4)
	g.pending_augments = ["prosperity"]  # +2 income
	_check(g.choose_augment("prosperity"), "choose economy augment")
	_eq(g.economy.bonus_income, 2, "prosperity adds +2 income bonus")
	# base income now includes the bonus.
	var before := g.economy.gold
	g.economy.grant_round_income()
	_check(g.economy.gold >= before + 5 + 2, "income reflects the +2 bonus")
	_check(g.pending_augments.is_empty(), "offer cleared after choosing")


func test_augment_combat_mods() -> void:
	var g := GameState.new(4)
	g.pending_augments = ["vigor"]  # +15% hp to all units
	_check(g.choose_augment("vigor"), "choose combat augment")
	var mods := g.player_combat_mods()
	_approx(float(mods.get("hp_pct", 0.0)), 0.15, "vigor yields +15% hp mod", 0.001)
	# The modifier scales a unit's max HP at combat build.
	var hero: HeroDef = GameDatabase.get_hero("gravik")
	var gu := GameUnit.new(7000, hero, 1)
	gu.board_pos = Vector2i(0, 0)
	var base_hp := gu.max_hp()
	var eng := CombatEngine.new([gu], [], 1, mods)
	_check(eng.units.size() == 1, "player unit present")
	_approx(eng.units[0].max_hp, base_hp * 1.15, "vigor scales unit max HP by 1.15", 1.0)


func test_save_load_roundtrip() -> void:
	var g := GameState.new(7)
	g.start_game()
	g.economy.gold = 33
	g.debug_add_unit(GameDatabase.heroes_of_cost(1)[0].id)
	g.grant_item("belt")
	g.pending_augments = ["prosperity"]
	g.choose_augment("prosperity")

	# Round-trip through JSON (as the real save backend does).
	var json_str := JSON.stringify(g.serialize())
	var reparsed = JSON.parse_string(json_str)
	_check(typeof(reparsed) == TYPE_DICTIONARY, "save survives JSON round-trip")
	var expect_next := g._rng.next_raw()  # the next value g's stream would produce

	var g2 := GameState.new(999)  # deliberately different seed
	g2.load_from(reparsed)
	_eq(g2._rng.next_raw(), expect_next, "restored RNG continues the exact same stream")
	_eq(g2.economy.gold, 33, "gold restored")
	_eq(g2.economy.bonus_income, 2, "economy augment bonus restored")
	_eq(g2.round_number, 1, "round restored")
	_eq(g2.roster.size(), 1, "roster restored")
	_check(g2.item_inventory.has("belt"), "item inventory restored")
	_check(g2.augments.has("prosperity"), "augment restored")


func test_augment_offer() -> void:
	# Offer rounds come from JSON (numbers may parse as float) — the offer must
	# still trigger. Round 2 is an offer round; round 3 is not.
	var g := GameState.new(8)
	g.round_number = 2
	g._maybe_offer_augments()
	_check(not g.pending_augments.is_empty(), "augments offered on an offer round")
	_eq(g.pending_augments.size(), 3, "three augments offered")
	var g2 := GameState.new(8)
	g2.round_number = 3
	g2._maybe_offer_augments()
	_check(g2.pending_augments.is_empty(), "no augments on a non-offer round")


func test_creep_round_opponent() -> void:
	var g := GameState.new(5)
	_check(g.is_creep_round(1), "round 1 is a creep round")
	_check(not g.is_creep_round(2), "round 2 is not a creep round")
	var rng := DeterministicRng.new(5)
	var team := OpponentFactory.build_creeps(1, rng)
	_check(not team.is_empty(), "creep round builds a non-empty enemy team")
	var creep_ids := {}
	for c in GameDatabase.all_creeps():
		creep_ids[c.id] = true
	for u in team:
		_check(creep_ids.has(u.hero.id), "opponent unit is a neutral creep")


func test_ability_params_loaded() -> void:
	# Ability magnitudes are data-driven (heroes.json), not hardcoded.
	var nova_hero: HeroDef = GameDatabase.get_hero("pyra")  # arcanist / nova
	_check(nova_hero != null, "pyra exists")
	_approx(float(nova_hero.ability_params.get("aoe_factor", -1.0)), 0.7,
		"nova aoe_factor loaded from data", 0.001)
	var emp: HeroDef = GameDatabase.get_hero("ignarok")  # berserker / empower
	_check(emp != null, "ignarok exists")
	_check(emp.ability_params.has("ad_pct"), "empower params loaded from data")


func test_combat_replay() -> void:
	var rec := Replay.capture(_mirror_team(), _mirror_team(), 4242, {})
	var sig := Replay.signature(Replay.run(rec))
	_eq(Replay.signature(Replay.run(rec)), sig, "replay reproduces the same outcome")
	# The record must survive JSON transport (client -> ranked backend).
	var rec_json = JSON.parse_string(JSON.stringify(rec))
	_check(typeof(rec_json) == TYPE_DICTIONARY, "record survives JSON")
	_eq(Replay.signature(Replay.run(rec_json)), sig, "replay reproduces after JSON transport")
	_check(Replay.verify(rec, sig), "verify accepts the true signature")
	_check(not Replay.verify(rec, "9|9|9,9|9,9"), "verify rejects a tampered signature")


func test_trait_toggle_affects_combat() -> void:
	# CombatEngine's apply_traits flag (used by the comp balance harness to measure
	# trait value) must actually gate trait application. Build a 2-distinct-hero
	# board that activates some trait, then compare unit stats ON vs OFF.
	var pair: Array = []
	for perk in GameDatabase.all_perks():
		var owners: Array = []
		for h in GameDatabase.all_heroes():
			if h.perks.has(perk.id):
				owners.append(h)
		if owners.size() >= 2:
			pair = [owners[0], owners[1]]
			break
	_check(pair.size() == 2, "found a trait with >=2 heroes to activate")
	if pair.size() != 2:
		return
	var mk := func(uid, h, col):
		var gu := GameUnit.new(uid, h, 2)
		gu.board_pos = Vector2i(col, 0)
		return gu
	var board: Array = [mk.call(1, pair[0], 3), mk.call(2, pair[1], 2)]
	var fp_on := _team_fingerprint(CombatEngine.new(board, [], 1, {}, true))
	var fp_off := _team_fingerprint(CombatEngine.new(board, [], 1, {}, false))
	_check(fp_on != fp_off, "traits ON must change unit stats vs OFF")
	var fp_default := _team_fingerprint(CombatEngine.new(board, [], 1))
	_approx(fp_default, fp_on, "apply_traits defaults to ON", 0.001)


## Sum of every trait-affected stat across team 0 — a single number that changes
## if (and only if) any trait effect was applied.
func _team_fingerprint(engine: CombatEngine) -> float:
	var s := 0.0
	for u in engine.units:
		if u.team != 0:
			continue
		s += u.max_hp + u.attack_damage + u.attack_speed + u.armor + u.magic_resist
		s += u.ability_power + u.shield + u.burn_dps + u.mana_on_hit_bonus + u.regen_pct
		s += u.omnivamp_pct + u.true_damage_pct + u.double_strike_chance + u.crit_bonus_pct
		s += u.ramp_as_per_hit + u.dodge_pct + u.heal_pct + u.summon_hp_pct
	return s


func test_stall_breaker_resolves_stalls() -> void:
	# Two very tanky units (gravik 2★ + 3x Titan Heart) grind past the 30s cap on
	# their own; the sudden-death stall-breaker must resolve the fight before it.
	var cfg: Dictionary = GameDatabase.cfg("combat", {})
	var cap := int(float(cfg.get("max_duration_sec", 30.0)) * int(cfg.get("tick_rate", 30)))
	var mk := func(uid):
		var gu := GameUnit.new(uid, GameDatabase.get_hero("gravik"), 2)
		gu.board_pos = Vector2i(3, 0)
		gu.items = ["titanheart", "titanheart", "titanheart"]
		return gu
	var off: Dictionary = CombatEngine.new([mk.call(1)], [mk.call(2)], 7, {}, true, false).run_to_completion()
	var on: Dictionary = CombatEngine.new([mk.call(1)], [mk.call(2)], 7, {}, true, true).run_to_completion()
	_check(int(off.ticks) >= cap, "without stall, two over-tanks grind to the time cap")
	_check(int(on.ticks) < cap, "stall-breaker resolves the fight before the cap")


func test_ability_damage_tracked() -> void:
	# A caster accumulates ability_damage_dealt from its casts (used by the item
	# harness to isolate ability-power / mana item value).
	var mage := GameUnit.new(1, GameDatabase.get_hero("abyssia"), 2)  # nova caster
	mage.board_pos = Vector2i(3, 0)
	var target := GameUnit.new(2, GameDatabase.get_hero("gravik"), 2)  # tanky, outlasts casts
	target.board_pos = Vector2i(3, 0)
	var eng := CombatEngine.new([mage], [target], 5, {}, true, false)
	eng.run_to_completion()
	var caster: CombatUnit = null
	for u in eng.units:
		if u.team == 0:
			caster = u
	_check(caster != null, "caster present after combat")
	if caster != null:
		_check(caster.ability_damage_dealt > 0.0, "caster accumulated ability damage from casts")


func test_augment_new_effects() -> void:
	# The extended combat-augment effects (crit / ability power) must propagate
	# through player_combat_mods() into the CombatEngine's global-mod application.
	var g := GameState.new(4)
	g.pending_augments = ["sharpshooter"]  # +25% crit
	_check(g.choose_augment("sharpshooter"), "choose crit augment")
	g.pending_augments = ["arcanesurge"]   # +30% ability power (stacks as a second pick)
	_check(g.choose_augment("arcanesurge"), "choose ability-power augment")
	var mods := g.player_combat_mods()
	_approx(float(mods.get("crit_bonus_pct", 0.0)), 0.25, "crit mod aggregated", 0.001)
	_approx(float(mods.get("ability_power_pct", 0.0)), 0.30, "ability-power mod aggregated", 0.001)
	var hero: HeroDef = GameDatabase.get_hero("abyssia")  # has ability power
	var gu := GameUnit.new(8100, hero, 1)
	gu.board_pos = Vector2i(0, 0)
	var base_ap := hero.ability_power
	var eng := CombatEngine.new([gu], [], 1, mods)
	_check(eng.units.size() == 1, "unit present")
	_approx(eng.units[0].crit_bonus_pct, 0.25, "crit applied to unit", 0.001)
	_approx(eng.units[0].ability_power, base_ap * 1.30, "ability power scaled on unit", 0.5)


func test_recipe_grid_complete() -> void:
	# Every pair of components must combine into a defined item — no "dead" combines
	# that waste a slot instead of merging.
	var comps := GameDatabase.all_components()
	_eq(comps.size(), 8, "8 components")
	var missing: Array = []
	for i in comps.size():
		for j in range(i, comps.size()):
			if GameDatabase.recipe_result(comps[i].id, comps[j].id) == null:
				missing.append(comps[i].id + "+" + comps[j].id)
	_check(missing.is_empty(), "every component pair has a recipe (missing: %s)" % str(missing))


func test_full_run_completes() -> void:
	# Drive the whole game loop (income -> shop -> buy -> place -> combat -> resolve
	# -> next round) for several rounds with a minimal bot. Guards against loop-level
	# regressions the single-fight tests can't see, and against infinite loops.
	var gs := GameState.new(123)
	gs.start_game()
	var guard := 0
	while gs.round_number <= 6 and gs.phase != GameState.Phase.GAME_OVER and guard < 60:
		guard += 1
		for slot in range(gs.shop.offers.size()):
			if gs.economy.gold < 3:
				break
			gs.buy(slot)
		for u in gs.bench_units():
			if gs.board_count() >= gs.economy.board_capacity():
				break
			var placed := false
			for row in [0, 1, 2, 3]:
				for col in [3, 2, 4, 1, 5, 0, 6]:
					var pos := Vector2i(col, row)
					if gs._hex_occupied_by(pos) == null and gs.place_on_board(u, pos):
						placed = true
						break
				if placed:
					break
		gs.start_combat()
		if gs.phase == GameState.Phase.GAME_OVER:
			break
		gs.begin_next_round()
	_check(gs.round_number >= 2, "run advanced past the first round")
	_check(gs.player_hp >= 0 and gs.player_hp <= 100, "player hp stays within [0,100]")
	_check(guard < 60, "run loop terminated without spinning")


func test_creep_round_reward() -> void:
	# Round 5 is a creep round but has no scheduled round_drops -> the creep bonus
	# is the only item source, so a win must drop exactly one component.
	var g := GameState.new(5)
	g.round_number = 5
	var before := g.item_inventory.size()
	g._resolve_combat({"winner": 0, "surviving_stars": [0, 0]}, [])
	_eq(g.item_inventory.size(), before + 1, "creep round win drops one component")
