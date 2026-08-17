class_name CombatEngine
extends RefCounted

## Deterministic auto-battle simulation.
##
## Fixed tickrate + seedable RNG => identical outcomes for identical inputs. This
## is the property that lets us write reproducible balance tests today and validate
## ranked results server-side later. Nothing here touches nodes/rendering; the
## presentation layer reads unit snapshots and consumes the per-tick `events` list
## for VFX/animation.
##
## Combat field: 7 columns x 8 rows. Player team occupies rows 4..7 (bottom),
## enemy team rows 0..3 (top, mirrored).

signal combat_finished(result: Dictionary)

var units: Array = []            # Array[CombatUnit], both teams
var events: Array = []           # events produced during the last step()
var finished: bool = false
var result: Dictionary = {}
var elapsed: float = 0.0
var tick: int = 0

var _rng: DeterministicRng
var _occupancy: Dictionary = {}  # Vector2i -> slot
var _by_slot: Dictionary = {}    # slot -> CombatUnit
var _next_slot: int = 0
var _dt: float
var _max_ticks: int
var _cfg: Dictionary


## teams: Array of two Arrays of GameUnit (team 0 = player, team 1 = enemy).
## Only board units (is_on_board) participate.
## player_mods: optional global stat modifiers (e.g. from augments) applied to
## every team-0 unit after traits. Keys: hp_pct, ad_pct, as_pct, armor_add,
## mr_add, omnivamp, start_shield_pct.
func _init(team0: Array, team1: Array, seed_value: int, player_mods: Dictionary = {}) -> void:
	_rng = DeterministicRng.new(seed_value)
	_cfg = GameDatabase.cfg("combat", {})
	var tick_rate := int(_cfg.get("tick_rate", 30))
	_dt = 1.0 / float(tick_rate)
	_max_ticks = int(float(_cfg.get("max_duration_sec", 30.0)) * tick_rate)
	_spawn_team(team0, 0, false)
	_spawn_team(team1, 1, true)
	# Apply traits per team after all units exist.
	TraitSystem.apply(_team_units(0))
	TraitSystem.apply(_team_units(1))
	# Apply player-global modifiers (augments) to the player's team.
	if not player_mods.is_empty():
		_apply_global_mods(_team_units(0), player_mods)


## Apply a flat/percent global modifier bundle to a set of units (augments).
func _apply_global_mods(team_units: Array, mods: Dictionary) -> void:
	var hp_pct := float(mods.get("hp_pct", 0.0))
	var ad_pct := float(mods.get("ad_pct", 0.0))
	var as_pct := float(mods.get("as_pct", 0.0))
	var armor_add := float(mods.get("armor_add", 0.0))
	var mr_add := float(mods.get("mr_add", 0.0))
	var omnivamp := float(mods.get("omnivamp", 0.0))
	var shield_pct := float(mods.get("start_shield_pct", 0.0))
	for u in team_units:
		if hp_pct != 0.0:
			u.max_hp *= (1.0 + hp_pct)
			u.hp = u.max_hp
		if ad_pct != 0.0:
			u.attack_damage *= (1.0 + ad_pct)
		if as_pct != 0.0:
			u.attack_speed *= (1.0 + as_pct)
		u.armor += armor_add
		u.magic_resist += mr_add
		u.omnivamp_pct += omnivamp
		if shield_pct != 0.0:
			u.shield += u.max_hp * shield_pct


func _spawn_team(team: Array, team_id: int, mirror: bool) -> void:
	for gu in team:
		if not gu.is_on_board():
			continue
		var pos: Vector2i
		if mirror:
			pos = HexGrid.mirror_to_enemy(gu.board_pos.x, gu.board_pos.y)
		else:
			pos = HexGrid.to_combat_friendly(gu.board_pos.x, gu.board_pos.y)
		pos = _find_free_near(pos)
		var cu := CombatUnit.from_game_unit(gu, team_id, pos, _next_slot)
		_next_slot += 1
		units.append(cu)
		_by_slot[cu.slot] = cu
		_occupancy[pos] = cu.slot


func _find_free_near(pos: Vector2i) -> Vector2i:
	if not _occupancy.has(pos):
		return pos
	# Spiral out through neighbours deterministically until a free hex is found.
	var frontier: Array = [pos]
	var seen := {pos: true}
	while not frontier.is_empty():
		var cur: Vector2i = frontier.pop_front()
		for n in HexGrid.neighbors(cur.x, cur.y):
			if seen.has(n):
				continue
			seen[n] = true
			if not _occupancy.has(n):
				return n
			frontier.append(n)
	return pos  # board full (shouldn't happen with capacity limits)


func _team_units(team_id: int) -> Array:
	var out: Array = []
	for u in units:
		if u.team == team_id:
			out.append(u)
	return out


func alive_count(team_id: int) -> int:
	var n := 0
	for u in units:
		if u.team == team_id and u.alive:
			n += 1
	return n


# --- Main loop ---------------------------------------------------------------

## Run to completion headlessly and return the result. Used by tests/sandbox.
func run_to_completion() -> Dictionary:
	while not finished:
		step()
	return result


## Advance the simulation by exactly one tick. Populates `events`.
func step() -> void:
	if finished:
		return
	events = []
	# Deterministic iteration order: stable slot order.
	for slot in range(_next_slot):
		var u: CombatUnit = _by_slot.get(slot, null)
		if u == null or not u.alive:
			continue
		# 1) Status effects (buffs, burn DoT, regen).
		var burn := u.tick_status(_dt)
		if burn > 0.0:
			u.take_final_damage(burn)
			if not u.alive:
				_on_death(u)
				continue
		if not u.alive:
			continue
		# 2) Cast ability if mana is full.
		if u.mana >= u.mana_max:
			_cast_ability(u)
			u.mana = 0.0
		if not u.alive:
			continue
		# 3) Target acquisition / validation.
		var target := _get_or_acquire_target(u)
		if target == null:
			continue
		# 4) Attack if in range, else move one step toward the target.
		var dist := HexGrid.distance(u.pos, target.pos)
		if dist <= u.attack_range:
			u.attack_cooldown -= _dt
			if u.attack_cooldown <= 0.0:
				_perform_attack(u, target)
				u.attack_cooldown = 1.0 / maxf(0.1, u.effective_attack_speed())
		else:
			_move_toward(u, target)

	tick += 1
	elapsed += _dt
	_check_end()


# --- Targeting ---------------------------------------------------------------

func _get_or_acquire_target(u: CombatUnit) -> CombatUnit:
	if u.target_slot >= 0:
		var t: CombatUnit = _by_slot.get(u.target_slot, null)
		if t != null and t.alive:
			return t
	# Nearest living enemy; tie-break by lowest slot for determinism.
	var best: CombatUnit = null
	var best_dist := 1 << 30
	for other in units:
		if other.team == u.team or not other.alive:
			continue
		var d := HexGrid.distance(u.pos, other.pos)
		if d < best_dist or (d == best_dist and (best == null or other.slot < best.slot)):
			best_dist = d
			best = other
	u.target_slot = best.slot if best != null else -1
	return best


# --- Movement ----------------------------------------------------------------

func _move_toward(u: CombatUnit, target: CombatUnit) -> void:
	u.move_accum += u.move_speed * _dt
	while u.move_accum >= 1.0:
		u.move_accum -= 1.0
		var step_pos := _best_step(u.pos, target.pos)
		if step_pos == u.pos:
			break  # blocked; wait
		_occupancy.erase(u.pos)
		u.pos = step_pos
		_occupancy[u.pos] = u.slot
		events.append({"type": "move", "slot": u.slot, "pos": u.pos})
		# Stop early if we are now in range.
		if HexGrid.distance(u.pos, target.pos) <= u.attack_range:
			break


func _best_step(from_pos: Vector2i, to_pos: Vector2i) -> Vector2i:
	var best := from_pos
	var best_dist := HexGrid.distance(from_pos, to_pos)
	for n in HexGrid.neighbors(from_pos.x, from_pos.y):
		if _occupancy.has(n):
			continue
		var d := HexGrid.distance(n, to_pos)
		if d < best_dist:
			best_dist = d
			best = n
	return best


# --- Attacks & damage --------------------------------------------------------

func _perform_attack(attacker: CombatUnit, defender: CombatUnit) -> void:
	var hits := 1
	if attacker.double_strike_chance > 0.0 and _rng.chance(attacker.double_strike_chance):
		hits = 2
	for _i in hits:
		if not defender.alive:
			break
		var raw := attacker.effective_ad()
		var crit_chance: float = float(_cfg.get("crit_base_chance", 0.0)) + attacker.crit_bonus_pct
		if crit_chance > 0.0 and _rng.chance(crit_chance):
			raw *= float(_cfg.get("crit_multiplier", 1.5))
		var dealt := _deal_damage(attacker, defender, raw, attacker.attack_type)
		# Attacker mana + berserker ramp + omnivamp + burn on hit.
		attacker.mana = minf(attacker.mana_max, attacker.mana
			+ float(_cfg.get("mana_per_attack", 10)) + attacker.mana_on_hit_bonus)
		if attacker.ramp_as_per_hit > 0.0:
			attacker.add_ramp(attacker.ramp_as_per_hit)
		if attacker.omnivamp_pct > 0.0:
			attacker.heal(dealt * attacker.omnivamp_pct)
		if attacker.burn_dps > 0.0:
			defender.apply_burn(defender.max_hp * attacker.burn_dps, 2.0)
		events.append({"type": "attack", "slot": attacker.slot, "target": defender.slot, "dmg": dealt})
		if not defender.alive:
			_on_death(defender)


## Applies mitigation + true-damage split, dodge, shield, and defender mana gain.
## Returns actual HP damage dealt.
func _deal_damage(attacker: CombatUnit, defender: CombatUnit, raw: float, dmg_type: String) -> float:
	if defender.dodge_pct > 0.0 and dmg_type == "physical" and _rng.chance(defender.dodge_pct):
		events.append({"type": "dodge", "slot": defender.slot})
		return 0.0
	var true_portion := 0.0
	var typed_portion := raw
	if attacker != null and attacker.true_damage_pct > 0.0:
		true_portion = raw * attacker.true_damage_pct
		typed_portion = raw - true_portion
	var mitigated := typed_portion
	match dmg_type:
		"physical":
			mitigated = typed_portion * (100.0 / (100.0 + defender.armor))
		"magic":
			mitigated = typed_portion * (100.0 / (100.0 + defender.magic_resist))
		"true":
			mitigated = typed_portion
	var final_damage := mitigated + true_portion
	var hp_damage := defender.take_final_damage(final_damage)
	# Surface damage for presentation (floating numbers); observational only.
	if hp_damage > 0.0:
		events.append({"type": "damage", "target": defender.slot, "amount": hp_damage, "dtype": dmg_type})
	# Defender gains mana from damage taken.
	if defender.alive:
		defender.mana = minf(defender.mana_max, defender.mana
			+ hp_damage * float(_cfg.get("mana_per_damage_taken_factor", 0.05)))
	return hp_damage


func _on_death(u: CombatUnit) -> void:
	_occupancy.erase(u.pos)
	events.append({"type": "death", "slot": u.slot})


# --- Abilities ---------------------------------------------------------------

func _cast_ability(u: CombatUnit) -> void:
	events.append({"type": "cast", "slot": u.slot, "kind": u.ability_kind})
	var p: Dictionary = u.ability_params
	match u.ability_kind:
		"burst":
			var t := _get_or_acquire_target(u)
			if t != null:
				_deal_damage(u, t, u.ability_power * float(p.get("burst_factor", 1.0)), "magic")
				if not t.alive:
					_on_death(t)
		"nova":
			# Centered on the current target (not the caster), so ranged mages
			# actually land their AoE on the enemy cluster.
			var nt := _get_or_acquire_target(u)
			if nt != null:
				var radius: int = maxi(1, u.ability_radius)
				var factor := float(p.get("aoe_factor", 0.7))
				var center: Vector2i = nt.pos
				for other in units:
					if other.team == u.team or not other.alive:
						continue
					if HexGrid.distance(center, other.pos) <= radius:
						_deal_damage(u, other, u.ability_power * factor, "magic")
						if not other.alive:
							_on_death(other)
		"heal":
			var ally := _most_wounded_ally(u)
			if ally != null:
				ally.heal(u.ability_power * float(p.get("heal_factor", 1.0)) * (1.0 + u.heal_pct))
		"shield":
			u.shield += u.ability_power * float(p.get("shield_factor", 1.0))
		"empower":
			var dur: float = u.ability_duration if u.ability_duration > 0.0 else 4.0
			var ad_pct := float(p.get("ad_pct", 0.4)) + float(p.get("star_ad_pct", 0.1)) * u.star
			u.apply_empower(ad_pct, float(p.get("as_add", 0.4)), dur)
		"execute":
			var et := _get_or_acquire_target(u)
			if et != null:
				var dmg := u.ability_power * float(p.get("factor", 1.5))
				if et.hp / et.max_hp < float(p.get("lowhp_threshold", 0.5)):
					dmg *= float(p.get("lowhp_mult", 2.0))
				_deal_damage(u, et, dmg, "true")
				if not et.alive:
					_on_death(et)
		"summon":
			_spawn_summon(u)


func _most_wounded_ally(u: CombatUnit) -> CombatUnit:
	var best: CombatUnit = null
	var best_missing := -1.0
	for other in units:
		if other.team != u.team or not other.alive:
			continue
		var missing: float = other.max_hp - other.hp
		if missing > best_missing or (missing == best_missing and (best == null or other.slot < best.slot)):
			best_missing = missing
			best = other
	return best


func _spawn_summon(u: CombatUnit) -> void:
	var pos := _find_free_near(u.pos)
	if _occupancy.has(pos):
		return
	var m := CombatUnit.new()
	m.slot = _next_slot
	_next_slot += 1
	m.team = u.team
	m.hero_id = u.hero_id
	m.star = 1
	m.is_summon = true
	m.pos = pos
	var hp_factor := float(u.ability_params.get("minion_hp_factor", 3.0))
	var ad_factor := float(u.ability_params.get("minion_ad_factor", 0.5))
	m.max_hp = u.ability_power * (hp_factor + u.summon_hp_pct * 5.0)
	m.hp = m.max_hp
	m.attack_damage = u.ability_power * ad_factor
	m.attack_speed = 0.8
	m.attack_range = 1
	m.armor = 20
	m.magic_resist = 20
	m.mana = 0
	m.mana_max = 9999  # summons don't cast
	m.move_speed = 2.5
	m.attack_type = "physical"
	m.ability_kind = "none"
	units.append(m)
	_by_slot[m.slot] = m
	_occupancy[pos] = m.slot
	events.append({"type": "summon", "owner": u.slot, "slot": m.slot, "pos": pos})


# --- End condition -----------------------------------------------------------

func _check_end() -> void:
	var a0 := alive_count(0)
	var a1 := alive_count(1)
	if a0 == 0 or a1 == 0 or tick >= _max_ticks:
		finished = true
		var winner := -1
		if a0 > 0 and a1 == 0:
			winner = 0
		elif a1 > 0 and a0 == 0:
			winner = 1
		elif a0 != a1:
			winner = 0 if a0 > a1 else 1
		else:
			# equal alive at timeout -> compare total HP.
			var hp0 := _total_hp(0)
			var hp1 := _total_hp(1)
			winner = -1 if hp0 == hp1 else (0 if hp0 > hp1 else 1)
		result = {
			"winner": winner,
			"ticks": tick,
			"elapsed": elapsed,
			"survivors": [a0, a1],
			"surviving_stars": [_surviving_stars(0), _surviving_stars(1)],
		}
		combat_finished.emit(result)


func _total_hp(team_id: int) -> float:
	var total := 0.0
	for u in units:
		if u.team == team_id and u.alive:
			total += u.hp
	return total


func _surviving_stars(team_id: int) -> int:
	var total := 0
	for u in units:
		if u.team == team_id and u.alive and not u.is_summon:
			total += u.star
	return total
