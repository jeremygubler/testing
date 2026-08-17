extends RefCounted

## Headless balance harness (implementation; loaded at runtime by tools/balance.gd).
##
## Measures each hero's damage output deterministically by pitting a single
## 2-star hero against a standard high-HP "training dummy" for the full combat
## duration, then reporting damage-per-second sorted and grouped by cost tier.
## Because the sim is deterministic (fixed seed), the numbers are reproducible and
## make good balance regression baselines.

const SEED := 777
const STAR := 2


func run() -> void:
	GameDatabase.reload()
	print("=== Aetherclash balance: per-hero DPS vs training dummy (%d★, seed %d) ===" % [STAR, SEED])

	var results: Array = []
	for hero in GameDatabase.all_heroes():
		var dps := _measure_dps(hero, STAR)
		var aoe := _measure_aoe_dps(hero, STAR)
		results.append({"id": hero.id, "name": hero.name, "cost": hero.cost, "dps": dps, "aoe": aoe})

	results.sort_custom(func(a, b): return a.dps > b.dps)

	print("\n%-14s %-4s %10s %10s" % ["hero", "cost", "single", "aoe(5)"])
	for r in results:
		print("%-14s %-4d %10.1f %10.1f" % [r.name, r.cost, r.dps, r.aoe])

	# Per-cost averages (higher cost should trend to higher dps).
	print("\nAverage DPS by cost tier (single / aoe):")
	for cost in range(1, 6):
		var s_single := 0.0
		var s_aoe := 0.0
		var n := 0
		for r in results:
			if r.cost == cost:
				s_single += r.dps
				s_aoe += r.aoe
				n += 1
		if n > 0:
			print("  cost %d: %.1f / %.1f  (n=%d)" % [cost, s_single / n, s_aoe / n, n])


## Full-duration damage output of one hero against a fixed dummy, as DPS.
func _measure_dps(hero: HeroDef, star: int) -> float:
	var attacker := GameUnit.new(1, hero, star)
	attacker.board_pos = Vector2i(3, 1)
	var dummy := GameUnit.new(2, _dummy_hero(), 1)
	dummy.board_pos = Vector2i(3, 1)

	var engine := CombatEngine.new([attacker], [dummy], SEED)
	engine.run_to_completion()

	for u in engine.units:
		if u.team == 1:
			var dealt: float = u.max_hp - u.hp
			return dealt / maxf(0.001, engine.elapsed)
	return 0.0


## Full-duration total damage across a tight cluster of 5 dummies, as DPS. This
## rewards AoE abilities (target-centered nova) that single-target benches miss.
func _measure_aoe_dps(hero: HeroDef, star: int) -> float:
	var attacker := GameUnit.new(1, hero, star)
	attacker.board_pos = Vector2i(3, 3)
	var dummies: Array = []
	var uid := 10
	for pos in [Vector2i(3, 1), Vector2i(2, 1), Vector2i(4, 1), Vector2i(3, 0), Vector2i(3, 2)]:
		var d := GameUnit.new(uid, _dummy_hero(), 1)
		uid += 1
		d.board_pos = pos
		dummies.append(d)

	var engine := CombatEngine.new([attacker], dummies, SEED)
	engine.run_to_completion()

	var total := 0.0
	for u in engine.units:
		if u.team == 1:
			total += u.max_hp - u.hp
	return total / maxf(0.001, engine.elapsed)


## A synthetic, inert damage sponge: huge HP, no attack, no movement, average
## resists. Built in code so it never pollutes the hero pool.
func _dummy_hero() -> HeroDef:
	var h := HeroDef.new()
	h.id = "training_dummy"
	h.name = "Dummy"
	h.cost = 0
	h.hp = 1000000.0
	h.attack_damage = 0.0
	h.attack_speed = 0.1
	h.attack_range = 1
	h.armor = 30.0
	h.magic_resist = 30.0
	h.mana_start = 0.0
	h.mana_max = 9999999.0
	h.move_speed = 0.0
	h.attack_type = "physical"
	h.ability_kind = "none"
	h.ability_power = 0.0
	h.ability_radius = 0
	h.ability_duration = 0.0
	return h
