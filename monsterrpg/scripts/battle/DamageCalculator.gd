class_name DamageCalculator
extends RefCounted

## Die komplette Schadensformel an einem Ort -- pure Funktionen, kein Zustand.
##
## [b]Formel[/b] (eigene, aber genre-typische Kurve):
## [codeblock]
## level_term = 2 * level / 5 + 2
## roh        = level_term * power * ANG / VET / 50 + 2
## schaden    = floor(roh * STAB * Effektivität * Volltreffer * Streuung)
## [/codeblock]
## * ANG/VET = ATK/DEF bei physischen, SPA/SPD bei speziellen Attacken
##   (jeweils inkl. Stat-Stufen und Statusmali, siehe [BattleCombatant]).
## * STAB (1.5): Bonus, wenn der Attackentyp einem Typ des Anwenders entspricht.
## * Effektivität: Produkt aus der Typenmatrix (0 / 0.5 / 1 / 2 pro Zieltyp).
## * Volltreffer: 1.5 mit 1/16 Chance (1/8 bei `high_crit`).
## * Streuung: 0.85..1.00, gezogen aus dem übergebenen RNG.
##
## Der RNG kommt IMMER von außen ([member BattleManager.rng]) -- nie `randf()`.
## Nur so ist ein Kampf bei gleichem Seed exakt reproduzierbar.

## Trefferwurf. accuracy == 0 heißt "trifft immer".
static func accuracy_check(move: MoveDefinition, rng: RandomNumberGenerator) -> bool:
	if move.accuracy <= 0:
		return true
	return rng.randf() * 100.0 < float(move.accuracy)


static func is_critical(move: MoveDefinition, rng: RandomNumberGenerator) -> bool:
	var chance: float = MonsterDatabase.cfg_float(
		"combat/high_crit_chance" if move.high_crit else "combat/crit_chance",
		0.125 if move.high_crit else 0.0625)
	return rng.randf() < chance


## Voller Wurf inkl. Trefferprüfung.
## Rückgabe: {"hit": bool, "damage": int, "effectiveness": float, "critical": bool}
static func compute(attacker: BattleCombatant, defender: BattleCombatant,
		move: MoveDefinition, rng: RandomNumberGenerator) -> Dictionary:
	var effectiveness: float = MonsterDatabase.type_multiplier_against(
		int(move.element), defender.types())

	if not accuracy_check(move, rng):
		return {"hit": false, "damage": 0, "effectiveness": effectiveness, "critical": false}
	if not move.is_damaging() or effectiveness <= 0.0:
		return {"hit": true, "damage": 0, "effectiveness": effectiveness, "critical": false}

	var critical: bool = is_critical(move, rng)
	var vmin: float = MonsterDatabase.cfg_float("combat/variance_min", 0.85)
	var vmax: float = MonsterDatabase.cfg_float("combat/variance_max", 1.0)
	var variance: float = rng.randf_range(vmin, vmax)
	var damage: int = _raw_damage(attacker, defender, move, effectiveness,
		critical, variance)
	return {
		"hit": true,
		"damage": damage,
		"effectiveness": effectiveness,
		"critical": critical,
	}


## Erwarteter Schaden ohne RNG (mittlere Streuung, kein Volltreffer).
## Wird von [BattleAI] und von der UI-Vorschau benutzt.
static func expected_damage(attacker: BattleCombatant, defender: BattleCombatant,
		move: MoveDefinition) -> float:
	if not move.is_damaging():
		return 0.0
	var effectiveness: float = MonsterDatabase.type_multiplier_against(
		int(move.element), defender.types())
	if effectiveness <= 0.0:
		return 0.0
	var vmin: float = MonsterDatabase.cfg_float("combat/variance_min", 0.85)
	var vmax: float = MonsterDatabase.cfg_float("combat/variance_max", 1.0)
	var accuracy: float = 1.0 if move.accuracy <= 0 else float(move.accuracy) / 100.0
	var mid: float = float(_raw_damage(attacker, defender, move, effectiveness,
		false, (vmin + vmax) * 0.5))
	return mid * accuracy


## Effektivitätstext für das Kampflog.
static func effectiveness_text(effectiveness: float) -> String:
	if effectiveness <= 0.0:
		return "Das hat keine Wirkung ..."
	if effectiveness >= 2.0:
		return "Sehr effektiv!"
	if effectiveness < 1.0:
		return "Nicht sehr effektiv ..."
	return ""


static func _raw_damage(attacker: BattleCombatant, defender: BattleCombatant,
		move: MoveDefinition, effectiveness: float, critical: bool,
		variance: float) -> int:
	var physical: bool = move.category == MoveDefinition.Category.PHYSICAL
	var atk: int = attacker.effective_stat(
		Stats.Stat.ATK if physical else Stats.Stat.SPA)
	var dfd: int = defender.effective_stat(
		Stats.Stat.DEF if physical else Stats.Stat.SPD)

	var level_term: float = 2.0 * float(attacker.monster.level) / 5.0 + 2.0
	var raw: float = level_term * float(move.power) * float(atk) \
		/ maxf(1.0, float(dfd)) / 50.0 + 2.0

	var stab: float = 1.0
	if attacker.types().has(int(move.element)):
		stab = MonsterDatabase.cfg_float("combat/stab_multiplier", 1.5)
	var crit_mult: float = 1.0
	if critical:
		crit_mult = MonsterDatabase.cfg_float("combat/crit_multiplier", 1.5)

	var total: float = raw * stab * effectiveness * crit_mult * variance
	# Ein Treffer macht immer mindestens 1 Schaden (außer bei Immunität).
	return maxi(1, int(floor(total)))
