class_name TraitSystem
extends RefCounted

## Computes active trait breakpoints for a team and applies the resulting effects
## to that team's CombatUnits at combat start. Trait "count" is the number of
## DISTINCT heroes on the board owning the trait (classic auto-battler rule:
## duplicate copies of the same hero don't raise a trait tier).

## Returns a Dictionary: trait_id -> {"count": int, "tier": int, "effect": Dictionary}
## for the given list of CombatUnits (one team).
static func compute_active(units: Array) -> Dictionary:
	var distinct_by_trait: Dictionary = {}   # trait_id -> {hero_id: true}
	for u in units:
		var hero: HeroDef = GameDatabase.get_hero(u.hero_id)
		if hero == null:
			continue
		for trait_id in hero.perks:
			if not distinct_by_trait.has(trait_id):
				distinct_by_trait[trait_id] = {}
			distinct_by_trait[trait_id][u.hero_id] = true

	var result: Dictionary = {}
	for trait_id in distinct_by_trait.keys():
		var perk: PerkDef = GameDatabase.get_perk(trait_id)
		if perk == null:
			continue
		var count: int = distinct_by_trait[trait_id].size()
		var effect := perk.active_effect(count)
		var tier := perk.active_tier_count(count)
		result[trait_id] = {"count": count, "tier": tier, "effect": effect}
	return result


## Apply active trait effects to a team's units in place. Call once, before the
## first combat tick.
static func apply(units: Array) -> Dictionary:
	var active := compute_active(units)

	# Gather additive modifiers per unit first (so multiple traits stack cleanly),
	# then apply once. Multiplicative-style effects are summed as percentages.
	for u in units:
		var hero: HeroDef = GameDatabase.get_hero(u.hero_id)
		if hero == null:
			continue
		var hp_pct := 0.0
		var ad_pct := 0.0
		var as_pct := 0.0
		var ap_pct := 0.0
		var armor_add := 0.0
		var mr_add := 0.0
		var shield_pct := 0.0
		for trait_id in hero.perks:
			if not active.has(trait_id):
				continue
			var eff: Dictionary = active[trait_id]["effect"]
			hp_pct += float(eff.get("hp_pct", 0.0))
			ad_pct += float(eff.get("ad_pct", 0.0))
			as_pct += float(eff.get("attack_speed_pct", 0.0))
			ap_pct += float(eff.get("ability_power_pct", 0.0))
			armor_add += float(eff.get("armor_add", 0.0))
			mr_add += float(eff.get("mr_add", 0.0))
			shield_pct += float(eff.get("shield_pct", 0.0))
			# Direct scalar fields (take the max across traits, they rarely overlap).
			u.burn_dps = maxf(u.burn_dps, float(eff.get("burn_dps", 0.0)))
			u.mana_on_hit_bonus = maxf(u.mana_on_hit_bonus, float(eff.get("mana_on_hit_bonus", 0.0)))
			u.regen_pct = maxf(u.regen_pct, float(eff.get("regen_pct", 0.0)))
			u.omnivamp_pct = maxf(u.omnivamp_pct, float(eff.get("omnivamp_pct", 0.0)))
			u.true_damage_pct = maxf(u.true_damage_pct, float(eff.get("true_damage_pct", 0.0)))
			u.double_strike_chance = maxf(u.double_strike_chance, float(eff.get("double_strike_chance", 0.0)))
			u.crit_bonus_pct = maxf(u.crit_bonus_pct, float(eff.get("crit_bonus_pct", 0.0)))
			u.ramp_as_per_hit = maxf(u.ramp_as_per_hit, float(eff.get("ramp_as_per_hit", 0.0)))
			u.dodge_pct = maxf(u.dodge_pct, float(eff.get("dodge_pct", 0.0)))
			u.heal_pct = maxf(u.heal_pct, float(eff.get("heal_pct", 0.0)))
			u.summon_hp_pct = maxf(u.summon_hp_pct, float(eff.get("summon_hp_pct", 0.0)))

		# Apply accumulated modifiers.
		if hp_pct != 0.0:
			u.max_hp *= (1.0 + hp_pct)
			u.hp = u.max_hp
		if ad_pct != 0.0:
			u.attack_damage *= (1.0 + ad_pct)
		if as_pct != 0.0:
			u.attack_speed *= (1.0 + as_pct)
		if ap_pct != 0.0:
			u.ability_power *= (1.0 + ap_pct)
			u.ability_power_pct = ap_pct
		u.armor += armor_add
		u.magic_resist += mr_add
		if shield_pct != 0.0:
			u.start_shield_pct = shield_pct
			u.shield += u.max_hp * shield_pct

	return active
