class_name Economy
extends RefCounted

## Per-player economy: gold, income, interest (10% capped at 5), win/loss streaks,
## XP and level. Pure logic, no UI. All constants come from GameDatabase config so
## balancing is data-driven.

signal gold_changed(gold: int)
signal level_changed(level: int, xp: int, xp_to_next: int)

var gold: int = 0
var level: int = 1
var xp: int = 0
var streak: int = 0            # >0 win streak, <0 loss streak, 0 none

var _cfg_eco: Dictionary
var _cfg_lvl: Dictionary


func _init() -> void:
	_cfg_eco = GameDatabase.cfg("economy", {})
	_cfg_lvl = GameDatabase.cfg("leveling", {})
	var pl: Dictionary = GameDatabase.cfg("player", {})
	gold = int(pl.get("starting_gold", 0))
	level = int(pl.get("starting_level", 1))
	xp = 0


# --- Gold --------------------------------------------------------------------

func can_afford(amount: int) -> bool:
	return gold >= amount


func add_gold(amount: int) -> void:
	gold = max(0, gold + amount)
	gold_changed.emit(gold)


## Spend gold. Returns false (and does nothing) if unaffordable.
func spend(amount: int) -> bool:
	if gold < amount:
		return false
	gold -= amount
	gold_changed.emit(gold)
	return true


# --- Interest & income -------------------------------------------------------

## Interest: 1 gold per `interest_per_gold` banked, capped at `interest_cap`.
func interest() -> int:
	var per := int(_cfg_eco.get("interest_per_gold", 10))
	var cap := int(_cfg_eco.get("interest_cap", 5))
	if per <= 0:
		return 0
	return min(cap, gold / per)


func streak_bonus() -> int:
	var table: Array = _cfg_eco.get("streak_gold", [])
	var bonus := 0
	var a := absi(streak)
	for row in table:
		if a >= int(row.get("min_abs_streak", 999)):
			bonus = int(row.get("gold", 0))
	return bonus


## Full round income = base + interest + streak bonus. Also grants passive XP.
## Returns a breakdown Dictionary for UI/logging.
func grant_round_income() -> Dictionary:
	var base := int(_cfg_eco.get("base_income", 5))
	var inter := interest()
	var strk := streak_bonus()
	var total := base + inter + strk
	add_gold(total)
	var passive_xp := int(_cfg_eco.get("passive_xp_per_round", 2))
	add_xp(passive_xp)
	return {"base": base, "interest": inter, "streak": strk, "total": total, "passive_xp": passive_xp}


# --- Streaks -----------------------------------------------------------------

func register_result(won: bool) -> void:
	if won:
		streak = 1 if streak < 0 else streak + 1
	else:
		streak = -1 if streak > 0 else streak - 1


# --- XP & level --------------------------------------------------------------

func _xp_needed_for(target_level: int) -> int:
	var table: Dictionary = _cfg_lvl.get("xp_to_reach_level", {})
	return int(table.get(str(target_level), 0))


func max_level() -> int:
	return int(_cfg_lvl.get("max_level", 9))


func xp_to_next() -> int:
	if level >= max_level():
		return 0
	return _xp_needed_for(level + 1) - xp


func add_xp(amount: int) -> void:
	if level >= max_level():
		return
	xp += amount
	while level < max_level() and xp >= _xp_needed_for(level + 1):
		level += 1
	level_changed.emit(level, xp, xp_to_next())


## Buy XP with gold. Returns true on success.
func buy_xp() -> bool:
	var cost := int(_cfg_eco.get("buy_xp_cost", 4))
	var amount := int(_cfg_eco.get("buy_xp_amount", 4))
	if level >= max_level():
		return false
	if not spend(cost):
		return false
	add_xp(amount)
	return true


## Units allowed on the board at the current level.
func board_capacity() -> int:
	var table: Dictionary = _cfg_lvl.get("board_units_by_level", {})
	return int(table.get(str(level), level))
