extends RefCounted

## Headless item balance harness (implementation; loaded at runtime by tools/items.gd).
##
## The last power axis. Equip each of the 14 completed items on a standardized 2★
## carry and measure its marginal combat value against fixed synthetic opponents,
## all else equal:
##   - phys%  : extra total DPS on a physical carry vs an inert high-HP soak.
##   - mage%  : extra total DPS on an ability carry vs the same soak.
##   - burst% : extra ABILITY-ONLY DPS on the ability carry (isolates ability power
##              and mana items, which raw total DPS drowns out under auto-attacks).
##   - sPhys% : extra ticks a physical carry survives a PHYSICAL aggressor (HP/armor).
##   - sMag%  : extra ticks it survives a MAGIC aggressor (HP/MR) — so magic-resist
##              items aren't invisible the way a physical-only bench left them.
## Deterministic (fixed seeds, stall disabled so the sudden-death chip doesn't
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
	var base_burst := _avg(func(s): return _ability_dps_vs_soak(mage, "", s))
	var base_sphys := _avg(func(s): return float(_survival_ticks(phys, "", s, false)))
	var base_smag := _avg(func(s): return float(_survival_ticks(phys, "", s, true)))

	var rows: Array = []
	for item in GameDatabase.all_items():
		if item.is_component():
			continue
		var phys_dps := _avg(func(s): return _dps_vs_soak(phys, item.id, s))
		var mage_dps := _avg(func(s): return _dps_vs_soak(mage, item.id, s))
		var burst_dps := _avg(func(s): return _ability_dps_vs_soak(mage, item.id, s))
		var sphys := _avg(func(s): return float(_survival_ticks(phys, item.id, s, false)))
		var smag := _avg(func(s): return float(_survival_ticks(phys, item.id, s, true)))
		rows.append({
			"name": item.name,
			"phys": 100.0 * (phys_dps / maxf(0.001, base_phys) - 1.0),
			"mage": 100.0 * (mage_dps / maxf(0.001, base_mage) - 1.0),
			"burst": 100.0 * (burst_dps / maxf(0.001, base_burst) - 1.0),
			"sphys": 100.0 * (sphys / maxf(0.001, base_sphys) - 1.0),
			"smag": 100.0 * (smag / maxf(0.001, base_smag) - 1.0),
		})

	rows.sort_custom(func(a, b): return _peak(a) > _peak(b))

	print("\n%-16s %7s %7s %7s %7s %7s  %s" % ["item", "phys%", "mage%", "burst%", "sPhys%", "sMag%", "profile"])
	for r in rows:
		print("%-16s %+7.1f %+7.1f %+7.1f %+7.1f %+7.1f  %s" % [r.name, r.phys, r.mage, r.burst, r.sphys, r.smag, _profile(r)])
	print("  (phys/mage = total DPS vs soak; burst = ability-only DPS; sPhys/sMag = survival vs a physical / magic aggressor)")


func _peak(r: Dictionary) -> float:
	return maxf(maxf(maxf(r.phys, r.mage), maxf(r.burst, r.sphys)), r.smag)


func _profile(r: Dictionary) -> String:
	var tags: Array = []
	if r.phys >= 15.0:
		tags.append("attacker")
	if r.burst >= 15.0:
		tags.append("caster")
	if r.sphys >= 15.0:
		tags.append("armor")
	if r.smag >= 15.0:
		tags.append("mr")
	if tags.is_empty():
		tags.append("marginal")
	return "/".join(tags)


# --- Measurements ------------------------------------------------------------

## Total DPS of a carry (optionally holding one item) vs a single inert high-HP
## soak over the full combat duration. Stall off so it never dies early.
func _dps_vs_soak(hero: HeroDef, item_id: String, seed_value: int) -> float:
	var engine := _run_vs_soak(hero, item_id, seed_value)
	for u in engine.units:
		if u.team == 1:
			return (u.max_hp - u.hp) / maxf(0.001, engine.elapsed)
	return 0.0


## Ability-only DPS of a carry vs the soak: isolates ability power / mana items,
## which total DPS drowns out because auto-attacks dominate against a lone target.
func _ability_dps_vs_soak(hero: HeroDef, item_id: String, seed_value: int) -> float:
	var engine := _run_vs_soak(hero, item_id, seed_value)
	for u in engine.units:
		if u.team == 0:
			return u.ability_damage_dealt / maxf(0.001, engine.elapsed)
	return 0.0


func _run_vs_soak(hero: HeroDef, item_id: String, seed_value: int) -> CombatEngine:
	var carry := GameUnit.new(1, hero, STAR)
	carry.board_pos = Vector2i(3, 3)
	if item_id != "":
		carry.items = [item_id]
	var soak := GameUnit.new(2, _soak_hero(), 1)
	soak.board_pos = Vector2i(3, 1)
	var engine := CombatEngine.new([carry], [soak], seed_value, {}, true, false)
	engine.run_to_completion()
	return engine


## Ticks a carry (optionally holding one item) survives a fixed hard-hitting
## aggressor. `magic` picks a magic-damage aggressor so MR items are measurable.
func _survival_ticks(hero: HeroDef, item_id: String, seed_value: int, magic: bool) -> int:
	var carry := GameUnit.new(1, hero, STAR)
	carry.board_pos = Vector2i(3, 3)
	if item_id != "":
		carry.items = [item_id]
	var agg := GameUnit.new(2, _aggressor_hero(magic), 1)
	agg.board_pos = Vector2i(3, 1)
	var engine := CombatEngine.new([carry], [agg], seed_value, {}, true, false)
	engine.run_to_completion()
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
## the carry's durability (and any defensive item) decides how long it lives. The
## damage type flips between physical (values armor) and magic (values MR).
func _aggressor_hero(magic: bool) -> HeroDef:
	var h := HeroDef.new()
	h.id = "item_aggressor_magic" if magic else "item_aggressor_phys"
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
	h.attack_type = "magic" if magic else "physical"
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
