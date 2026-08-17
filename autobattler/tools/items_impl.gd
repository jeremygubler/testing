extends RefCounted

## Headless item balance harness (implementation; loaded at runtime by tools/items.gd).
##
## The last unmeasured power axis. Like the per-trait package bench, but for the 14
## completed items: equip each on a standardized 2★ carry and measure its marginal
## combat value against fixed synthetic opponents, all else equal:
##   - phys%  : extra DPS on a physical carry vs an inert high-HP soak (AD/AS/crit).
##   - mage%  : extra DPS on an ability carry vs the same soak (ability power / mana).
##   - surv%  : extra ticks a physical carry survives a fixed hard-hitting aggressor
##              (HP / armor / MR / omnivamp / lifesteal-style sustain).
## Deterministic (fixed seeds, stall disabled so the escalating true damage doesn't
## corrupt the full-duration reading) and reproducible as a balance baseline.

const STAR := 2
const SEEDS := [303, 606, 909]


func run() -> void:
	GameDatabase.reload()
	print("=== Aetherclash item value: marginal combat worth of each completed item (%d★) ===" % STAR)

	var phys := _pick_physical_carry()
	var mage := _pick_ability_carry()
	print("phys carry: %s (ad %.0f, as %.2f)   mage carry: %s (ap %.0f, %s)" % [
		phys.name, phys.attack_damage, phys.attack_speed, mage.name, mage.ability_power, mage.ability_kind])

	# Baselines (no item), averaged over seeds, computed once.
	var base_phys := _avg(func(s): return _dps_vs_soak(phys, "", s))
	var base_mage := _avg(func(s): return _dps_vs_soak(mage, "", s))
	var base_surv := _avg(func(s): return float(_survival_ticks(phys, "", s)))

	var rows: Array = []
	for item in GameDatabase.all_items():
		if item.is_component():
			continue
		var phys_dps := _avg(func(s): return _dps_vs_soak(phys, item.id, s))
		var mage_dps := _avg(func(s): return _dps_vs_soak(mage, item.id, s))
		var surv := _avg(func(s): return float(_survival_ticks(phys, item.id, s)))
		rows.append({
			"name": item.name,
			"phys": 100.0 * (phys_dps / maxf(0.001, base_phys) - 1.0),
			"mage": 100.0 * (mage_dps / maxf(0.001, base_mage) - 1.0),
			"surv": 100.0 * (surv / maxf(0.001, base_surv) - 1.0),
		})

	rows.sort_custom(func(a, b): return _peak(a) > _peak(b))

	print("\n%-16s %8s %8s %8s  %s" % ["item", "phys%", "mage%", "surv%", "profile"])
	for r in rows:
		print("%-16s %+8.1f %+8.1f %+8.1f  %s" % [r.name, r.phys, r.mage, r.surv, _profile(r)])
	print("  (phys%%/mage%% = extra DPS vs a soak dummy on a physical / ability carry; surv%% = extra survival time vs a fixed aggressor)")


func _peak(r: Dictionary) -> float:
	return maxf(maxf(r.phys, r.mage), r.surv)


func _profile(r: Dictionary) -> String:
	var tags: Array = []
	if r.phys >= 15.0:
		tags.append("attacker")
	if r.mage >= 15.0:
		tags.append("caster")
	if r.surv >= 15.0:
		tags.append("tank")
	if tags.is_empty():
		tags.append("marginal")
	return "/".join(tags)


# --- Measurements ------------------------------------------------------------

## DPS of a carry (optionally holding one item) against a single inert high-HP soak
## over the full combat duration. Stall is off so it never dies early.
func _dps_vs_soak(hero: HeroDef, item_id: String, seed_value: int) -> float:
	var carry := GameUnit.new(1, hero, STAR)
	carry.board_pos = Vector2i(3, 3)
	if item_id != "":
		carry.items = [item_id]
	var soak := GameUnit.new(2, _soak_hero(), 1)
	soak.board_pos = Vector2i(3, 1)
	var engine := CombatEngine.new([carry], [soak], seed_value, {}, true, false)
	engine.run_to_completion()
	for u in engine.units:
		if u.team == 1:
			return (u.max_hp - u.hp) / maxf(0.001, engine.elapsed)
	return 0.0


## Ticks a carry (optionally holding one item) survives against a fixed hard-hitting
## aggressor. Higher = more effective durability. Stall off (would mask the item).
func _survival_ticks(hero: HeroDef, item_id: String, seed_value: int) -> int:
	var carry := GameUnit.new(1, hero, STAR)
	carry.board_pos = Vector2i(3, 3)
	if item_id != "":
		carry.items = [item_id]
	var agg := GameUnit.new(2, _aggressor_hero(), 1)
	agg.board_pos = Vector2i(3, 1)
	var engine := CombatEngine.new([carry], [agg], seed_value, {}, true, false)
	engine.run_to_completion()
	# Combat ends when the carry dies (team 0 wiped) or at the time cap; either way
	# engine.tick is how long the carry lasted.
	return engine.tick


# --- Carry selection ---------------------------------------------------------

func _pick_physical_carry() -> HeroDef:
	var best: HeroDef = null
	var best_score := -1.0
	for h in GameDatabase.all_heroes():
		if h.attack_type != "physical":
			continue
		var score: float = h.attack_damage * h.attack_speed
		if score > best_score:
			best_score = score
			best = h
	return best if best != null else GameDatabase.all_heroes()[0]


func _pick_ability_carry() -> HeroDef:
	var best: HeroDef = null
	var best_ap := -1.0
	for h in GameDatabase.all_heroes():
		if not (h.ability_kind == "nova" or h.ability_kind == "burst"):
			continue
		if h.ability_power > best_ap:
			best_ap = h.ability_power
			best = h
	return best if best != null else GameDatabase.all_heroes()[0]


# --- Synthetic opponents (built in code so they never pollute the hero pool) --

## Inert damage sponge: enormous HP, no attack. Measures raw damage output.
func _soak_hero() -> HeroDef:
	var h := HeroDef.new()
	h.id = "item_soak"
	h.name = "Soak"
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


## Fixed hard-hitting bruiser: enough HP to outlast the carry, high sustained DPS so
## the carry's durability (and any defensive item) decides how long it lives.
func _aggressor_hero() -> HeroDef:
	var h := HeroDef.new()
	h.id = "item_aggressor"
	h.name = "Aggressor"
	h.cost = 0
	h.hp = 8000.0
	h.attack_damage = 110.0
	h.attack_speed = 1.1
	h.attack_range = 1
	h.armor = 40.0
	h.magic_resist = 40.0
	h.mana_start = 0.0
	h.mana_max = 9999999.0
	h.move_speed = 3.0
	h.attack_type = "physical"
	h.ability_kind = "none"
	h.ability_power = 0.0
	h.ability_radius = 0
	h.ability_duration = 0.0
	return h


# --- Helpers -----------------------------------------------------------------

func _avg(fn: Callable) -> float:
	var s := 0.0
	for seed_value in SEEDS:
		s += float(fn.call(seed_value))
	return s / SEEDS.size()
