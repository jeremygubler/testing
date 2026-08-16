class_name CombatUnit
extends RefCounted

## A unit instance participating in a single auto-battle. Built from a GameUnit
## (or spawned as a summon). Holds all mutable combat state. No rendering here —
## the presentation layer mirrors these via read-only snapshots.

var slot: int                    # deterministic tiebreak/order id (stable per fight)
var team: int                    # 0 = player, 1 = enemy
var hero_id: String
var star: int = 1
var is_summon: bool = false

# Position on the combined combat field (col 0..6, row 0..7).
var pos: Vector2i

# Live stats (already trait-modified at combat start).
var max_hp: float
var hp: float
var attack_damage: float
var attack_speed: float          # attacks per second (base; buffs applied on top)
var attack_range: int
var armor: float
var magic_resist: float
var mana: float
var mana_max: float
var move_speed: float            # hexes per second
var attack_type: String          # "physical" | "magic"

# Ability.
var ability_kind: String
var ability_power: float
var ability_radius: int
var ability_duration: float
var ability_params: Dictionary = {}   # per-kind tunable magnitudes (data-driven)

# Trait-derived combat modifiers (set by TraitSystem before the fight).
var burn_dps: float = 0.0            # % of target max hp per second, on-hit
var mana_on_hit_bonus: float = 0.0
var regen_pct: float = 0.0           # % max hp per second
var omnivamp_pct: float = 0.0
var true_damage_pct: float = 0.0
var ability_power_pct: float = 0.0
var double_strike_chance: float = 0.0
var crit_bonus_pct: float = 0.0
var ramp_as_per_hit: float = 0.0
var dodge_pct: float = 0.0
var heal_pct: float = 0.0
var start_shield_pct: float = 0.0
var summon_hp_pct: float = 0.0

# Transient combat state.
var shield: float = 0.0
var attack_cooldown: float = 0.0     # seconds until next attack allowed
var move_accum: float = 0.0          # accumulated fractional hex movement
var target_slot: int = -1
var alive: bool = true

# Temporary buffs (empower): additive percent to AD and flat to AS, with expiry.
var _ad_bonus_pct: float = 0.0
var _as_bonus: float = 0.0
var _buff_time_left: float = 0.0
# Berserker ramp accumulates permanent (per-combat) attack speed.
var _ramp_as: float = 0.0
# Active burn stacks on THIS unit: [remaining_seconds, dps].
var _burn_time: float = 0.0
var _burn_dps_value: float = 0.0

# Regen accumulator so healing applies smoothly per tick.
var _regen_accum: float = 0.0


static func from_game_unit(gu: GameUnit, unit_team: int, position: Vector2i, unit_slot: int) -> CombatUnit:
	var c := CombatUnit.new()
	c.slot = unit_slot
	c.team = unit_team
	c.hero_id = gu.hero.id
	c.star = gu.star
	c.pos = position
	c.max_hp = gu.max_hp()
	c.hp = c.max_hp
	c.attack_damage = gu.attack_damage()
	c.attack_speed = gu.hero.attack_speed
	c.attack_range = gu.hero.attack_range
	c.armor = gu.hero.armor
	c.magic_resist = gu.hero.magic_resist
	c.mana = gu.hero.mana_start
	c.mana_max = gu.hero.mana_max
	c.move_speed = gu.hero.move_speed
	c.attack_type = gu.hero.attack_type
	c.ability_kind = gu.hero.ability_kind
	# Ability power scales with star like other damage.
	c.ability_power = gu.hero.ability_power * HeroDef.star_multiplier(gu.star)
	c.ability_radius = gu.hero.ability_radius
	c.ability_duration = gu.hero.ability_duration
	c.ability_params = gu.hero.ability_params
	c._apply_items(gu.items)
	return c


## Apply equipped item stat bundles on top of base (star-scaled) stats.
func _apply_items(item_ids: Array) -> void:
	var as_pct := 0.0
	for item_id in item_ids:
		var item: ItemDef = GameDatabase.get_item(item_id)
		if item == null:
			continue
		var s: Dictionary = item.stats
		max_hp += float(s.get("hp", 0.0))
		attack_damage += float(s.get("ad", 0.0))
		ability_power += float(s.get("ability_power", 0.0))
		armor += float(s.get("armor", 0.0))
		magic_resist += float(s.get("mr", 0.0))
		mana += float(s.get("mana_start", 0.0))
		crit_bonus_pct += float(s.get("crit", 0.0))
		omnivamp_pct += float(s.get("omnivamp", 0.0))
		as_pct += float(s.get("as_pct", 0.0))
	if as_pct != 0.0:
		attack_speed *= (1.0 + as_pct)
	# Re-fill HP to the new max and clamp starting mana.
	hp = max_hp
	mana = minf(mana, mana_max)


## Effective attack speed including temp buff and berserker ramp (capped at 5.0).
func effective_attack_speed() -> float:
	return minf(5.0, attack_speed + _as_bonus + _ramp_as)


## Effective attack damage including temp buff.
func effective_ad() -> float:
	return attack_damage * (1.0 + _ad_bonus_pct)


func apply_empower(ad_pct: float, as_add: float, duration: float) -> void:
	_ad_bonus_pct = ad_pct
	_as_bonus = as_add
	_buff_time_left = duration


func add_ramp(amount: float) -> void:
	_ramp_as += amount


func apply_burn(dps: float, duration: float) -> void:
	# Refresh with the stronger burn.
	if dps >= _burn_dps_value:
		_burn_dps_value = dps
	_burn_time = maxf(_burn_time, duration)


## Advance time-based buffs/dots for this unit. Returns burn damage to apply.
func tick_status(dt: float) -> float:
	if _buff_time_left > 0.0:
		_buff_time_left -= dt
		if _buff_time_left <= 0.0:
			_ad_bonus_pct = 0.0
			_as_bonus = 0.0
	var burn_damage := 0.0
	if _burn_time > 0.0:
		burn_damage = _burn_dps_value * dt
		_burn_time -= dt
		if _burn_time <= 0.0:
			_burn_dps_value = 0.0
	# Regen.
	if regen_pct > 0.0 and alive:
		heal(max_hp * regen_pct * dt)
	return burn_damage


func heal(amount: float) -> void:
	if not alive or amount <= 0.0:
		return
	hp = minf(max_hp, hp + amount)


## Apply already-computed final damage (post-mitigation) to this unit, absorbing
## with shield first. Returns the actual HP damage dealt (for lifesteal/mana).
func take_final_damage(amount: float) -> float:
	if not alive or amount <= 0.0:
		return 0.0
	var remaining := amount
	if shield > 0.0:
		var absorbed := minf(shield, remaining)
		shield -= absorbed
		remaining -= absorbed
	hp -= remaining
	if hp <= 0.0:
		hp = 0.0
		alive = false
	return remaining
