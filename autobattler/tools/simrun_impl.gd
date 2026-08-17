extends RefCounted

## Headless full-run simulator (implementation; loaded at runtime by tools/simrun.gd).
##
## The combat engine and the balance harnesses only ever exercised single fights.
## This drives the ENTIRE game loop through GameState — income, shop rolls, buying,
## auto-combine, leveling, board placement, augments, creep rounds, round rewards,
## PvE combat and HP/elimination — with a simple deterministic greedy bot, for many
## rounds across several seeds. It's an end-to-end smoke test of the whole run (does
## the loop hold up over 30 rounds without breaking?) AND a pacing readout (how gold,
## level and HP actually evolve). Fully reproducible from the seed.

const ROUND_CAP := 30
const SEEDS := [11, 22, 33]
const CENTER_COLS := [3, 2, 4, 1, 5, 0, 6]


func run() -> void:
	GameDatabase.reload()
	print("=== Aetherclash full-run simulator: greedy bot vs PvE, %d rounds, seeds %s ===" % [ROUND_CAP, str(SEEDS)])

	var all_runs: Array = []
	for seed_value in SEEDS:
		all_runs.append(_play_run(seed_value))

	# Per-round trace of the first run (representative pacing curve).
	print("\n-- Run trace (seed %d) --" % SEEDS[0])
	print("%5s %4s %5s %6s %4s %5s %7s" % ["round", "lvl", "gold", "board", "hp", "res", "ticks"])
	for r in all_runs[0].rounds:
		print("%5d %4d %5d %6d %4d %5s %7d" % [r.round, r.level, r.gold, r.board, r.hp, ("W" if r.won else "L"), r.ticks])

	# Aggregate pacing across seeds.
	print("\n-- Aggregate over %d runs --" % all_runs.size())
	var tot_wins := 0
	var tot_games := 0
	var sum_final_level := 0.0
	var sum_final_hp := 0.0
	var sum_ticks := 0.0
	var tick_n := 0
	var timeouts := 0
	var cap_ticks := int(GameDatabase.cfg("combat", {}).get("max_duration_sec", 30.0)) * int(GameDatabase.cfg("combat", {}).get("tick_rate", 30))
	var l4 := []
	var l6 := []
	var l8 := []
	for run in all_runs:
		tot_wins += run.wins
		tot_games += run.rounds.size()
		sum_final_level += run.final_level
		sum_final_hp += run.final_hp
		for r in run.rounds:
			sum_ticks += r.ticks
			tick_n += 1
			if r.ticks >= cap_ticks:
				timeouts += 1
		if run.reached.has(4): l4.append(run.reached[4])
		if run.reached.has(6): l6.append(run.reached[6])
		if run.reached.has(8): l8.append(run.reached[8])
	print("  PvE win rate:     %.1f%%  (%d/%d rounds)" % [100.0 * tot_wins / maxf(1, tot_games), tot_wins, tot_games])
	print("  avg final level:  %.1f" % (sum_final_level / all_runs.size()))
	print("  avg final HP:     %.1f" % (sum_final_hp / all_runs.size()))
	print("  avg fight length: %.1f ticks (%.1fs @30tps)" % [sum_ticks / maxf(1, tick_n), sum_ticks / maxf(1, tick_n) / 30.0])
	print("  fights hitting cap (timeouts): %d/%d (%.1f%%)" % [timeouts, tick_n, 100.0 * timeouts / maxf(1, tick_n)])
	print("  reached L4 by round (avg): %s" % _avg_str(l4))
	print("  reached L6 by round (avg): %s" % _avg_str(l6))
	print("  reached L8 by round (avg): %s" % _avg_str(l8))
	# Sanity flags for whole-loop health.
	for run in all_runs:
		if run.rounds.is_empty():
			print("  !! seed %d produced no rounds" % run.seed)
	print("\nsimrun: %d runs completed without error." % all_runs.size())


## Play one full run and return a summary dict.
func _play_run(seed_value: int) -> Dictionary:
	var gs := GameState.new(seed_value)
	gs.start_game()  # round 1, SHOP phase

	var rounds: Array = []
	var wins := 0
	var reached: Dictionary = {}

	while gs.round_number <= ROUND_CAP and gs.phase != GameState.Phase.GAME_OVER:
		_bot_shop_phase(gs)
		# Record level milestones (first round we hit them).
		for milestone in [4, 6, 8]:
			if gs.economy.level >= milestone and not reached.has(milestone):
				reached[milestone] = gs.round_number

		gs.start_combat()  # resolves internally; updates HP/economy; may end the game
		var res: Dictionary = gs.last_result
		var won: bool = int(res.get("winner", -1)) == 0
		if won:
			wins += 1
		rounds.append({
			"round": gs.round_number,
			"level": gs.economy.level,
			"gold": gs.economy.gold,
			"board": gs.board_count(),
			"hp": gs.player_hp,
			"won": won,
			"ticks": int(res.get("ticks", 0)),
		})

		if gs.phase == GameState.Phase.GAME_OVER:
			break
		gs.begin_next_round()

	return {
		"seed": seed_value,
		"rounds": rounds,
		"wins": wins,
		"final_level": gs.economy.level,
		"final_hp": gs.player_hp,
		"reached": reached,
	}


## One deterministic greedy shop phase: take any offered augment, push level when the
## board is full or gold is flush, buy affordable offers, then fill the board by role.
func _bot_shop_phase(gs) -> void:
	if not gs.pending_augments.is_empty():
		gs.choose_augment(String(gs.pending_augments[0]))

	# Level up to unlock board slots when the board is already full, or when rich.
	if (gs.board_count() >= gs.economy.board_capacity() and gs.economy.gold >= 8) or gs.economy.gold >= 24:
		gs.buy_xp()

	# One reroll when flush and there's room to hold what we might find.
	if gs.economy.gold >= 30 and gs.bench_count() < 6:
		gs.reroll()

	# Buy affordable offers (buy() handles pool/bench/auto-combine internally).
	for slot in range(gs.shop.offers.size()):
		if gs.economy.gold < 3:
			break
		gs.buy(slot)

	_fill_board(gs)


## Place bench units onto the board up to capacity: melee toward the front rows,
## ranged toward the back, filled center-out. Never displaces a placed unit.
func _fill_board(gs) -> void:
	var cap: int = gs.economy.board_capacity()
	for u in gs.bench_units():
		if gs.board_count() >= cap:
			break
		var rows: Array = [0, 1, 2, 3] if int(u.hero.attack_range) <= 1 else [3, 2, 1, 0]
		var placed := false
		for row in rows:
			for col in CENTER_COLS:
				var pos := Vector2i(col, row)
				if gs._hex_occupied_by(pos) == null and gs.place_on_board(u, pos):
					placed = true
					break
			if placed:
				break


func _avg_str(arr: Array) -> String:
	if arr.is_empty():
		return "n/a"
	var s := 0.0
	for v in arr:
		s += v
	return "%.1f (n=%d)" % [s / arr.size(), arr.size()]
