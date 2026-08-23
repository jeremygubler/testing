class_name BattleCombatant
extends RefCounted

## Ein Monster *innerhalb eines Kampfes*: die persistente [MonsterInstance]
## plus alles, was nur für die Dauer des Kampfes gilt (Stat-Stufen, Flags).
##
## Diese Trennung ist wichtig: Buffs/Debuffs dürfen den Spielstand nicht
## anfassen. KP und Statusprobleme werden dagegen absichtlich *durchgeschrieben*
## -- Schaden bleibt nach dem Kampf bestehen.

var monster: MonsterInstance = null
## [constant BattleManager.Side]
var side: int = 0
## Position im jeweiligen Team.
var party_index: int = 0
## Stat-Stufen (-6..+6) je [enum Stats.Stat]; HP-Stufe bleibt ungenutzt.
var stages: Array[int] = [0, 0, 0, 0, 0, 0]
## Zählt, wie viele Runden dieser Kämpfer schon im Feld steht.
var turns_active: int = 0


static func create(p_monster: MonsterInstance, p_side: int, p_index: int) -> BattleCombatant:
	var c := BattleCombatant.new()
	c.monster = p_monster
	c.side = p_side
	c.party_index = p_index
	return c


func name() -> String:
	return monster.display_name()


func is_alive() -> bool:
	return monster != null and not monster.is_fainted()


func hp() -> int:
	return monster.current_hp


func max_hp() -> int:
	return monster.max_hp()


func hp_ratio() -> float:
	return monster.hp_ratio()


func types() -> Array[int]:
	return monster.types()


func status() -> int:
	return int(monster.status)


## Beim Auswechseln verfallen alle Stat-Änderungen.
func reset_volatile() -> void:
	stages = [0, 0, 0, 0, 0, 0]
	turns_active = 0


## Verändert eine Stat-Stufe. Rückgabe: tatsächliche Änderung (0 = am Limit).
func change_stage(stat: int, delta: int) -> int:
	if stat < 0 or stat >= stages.size():
		return 0
	var before: int = stages[stat]
	stages[stat] = clampi(before + delta, Stats.STAGE_MIN, Stats.STAGE_MAX)
	return stages[stat] - before


func stage(stat: int) -> int:
	return stages[stat] if stat >= 0 and stat < stages.size() else 0


## Kampfwirksamer Statuswert: Basiswert * Stufenfaktor * Statusmalus.
func effective_stat(stat: int) -> int:
	var base: int = monster.base_value(stat)
	var value: float = float(base) * Stats.stage_multiplier(stage(stat))
	if stat == Stats.Stat.ATK and status() == StatusAilments.Status.BURN:
		value *= MonsterDatabase.cfg_float("combat/burn_attack_multiplier", 0.5)
	if stat == Stats.Stat.SPE and status() == StatusAilments.Status.PARALYZE:
		value *= MonsterDatabase.cfg_float("combat/paralyze_speed_multiplier", 0.5)
	return maxi(1, int(round(value)))


func effective_speed() -> int:
	return effective_stat(Stats.Stat.SPE)


func move_slot(index: int) -> MoveSlot:
	if index < 0 or index >= monster.moves.size():
		return null
	return monster.moves[index]


func move_at(index: int) -> MoveDefinition:
	var slot: MoveSlot = move_slot(index)
	return slot.definition() if slot != null else null


## Kurzstatus für Logs: "Glutwelp Lv5 18/24 KP (VBR)".
func describe() -> String:
	var st: int = status()
	var suffix: String = "" if st == StatusAilments.Status.NONE \
		else " (%s)" % StatusAilments.label(st)
	return "%s Lv%d %d/%d KP%s" % [name(), monster.level, hp(), max_hp(), suffix]
