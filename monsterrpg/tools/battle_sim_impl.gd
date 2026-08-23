extends RefCounted

## Implementierung von battle_sim.gd (siehe dort).

const SAMPLE_BATTLES: int = 200
const SAMPLE_LEVEL: int = 12
const TOURNAMENT_LEVEL: int = 15


func run(_tree: SceneTree) -> int:
	var failures: int = 0
	print("=== Determinismus ===")
	failures += _check_determinism()
	print("\n=== Stichprobe (%d Kämpfe, Level %d) ===" % [SAMPLE_BATTLES, SAMPLE_LEVEL])
	failures += _random_sample()
	print("\n=== Rundenturnier (Level %d) ===" % TOURNAMENT_LEVEL)
	_tournament()
	print("\nbattle-sim: %d Probleme" % failures)
	return 1 if failures > 0 else 0


# ---------------------------------------------------------------------------
# 1. Determinismus
# ---------------------------------------------------------------------------

func _check_determinism() -> int:
	var ids: Array[String] = MonsterDatabase.species_ids()
	if ids.size() < 2:
		push_error("Zu wenige Arten für die Simulation.")
		return 1
	var first: Dictionary = _fight(ids[0], ids[1], SAMPLE_LEVEL, 987654321)
	var second: Dictionary = _fight(ids[0], ids[1], SAMPLE_LEVEL, 987654321)
	var log_a: Array = first["log"] as Array
	var log_b: Array = second["log"] as Array
	if log_a == log_b:
		print("  ok    %d Log-Zeilen, %d Runden, identisch reproduziert" % [
			log_a.size(), int(first["turns"])])
		return 0
	push_error("Kampf ist NICHT deterministisch!")
	print("  FAIL  Logs unterscheiden sich (%d vs %d Zeilen)" % [
		log_a.size(), log_b.size()])
	return 1


# ---------------------------------------------------------------------------
# 2. Stichprobe
# ---------------------------------------------------------------------------

func _random_sample() -> int:
	var ids: Array[String] = MonsterDatabase.species_ids()
	var rng := RandomNumberGenerator.new()
	rng.seed = 20260823
	var wins: int = 0
	var losses: int = 0
	var draws: int = 0
	var turns_total: int = 0
	for i in SAMPLE_BATTLES:
		var a: String = ids[rng.randi_range(0, ids.size() - 1)]
		var b: String = ids[rng.randi_range(0, ids.size() - 1)]
		var res: Dictionary = _fight(a, b, SAMPLE_LEVEL, rng.randi() | 1)
		turns_total += int(res["turns"])
		match int(res["result"]):
			BattleManager.Result.PLAYER_WON:
				wins += 1
			BattleManager.Result.PLAYER_LOST:
				losses += 1
			_:
				draws += 1
	print("  Seite A: %d Siege / %d Niederlagen / %d Abbrüche" % [wins, losses, draws])
	print("  Durchschnitt: %.1f Runden" % (float(turns_total) / float(SAMPLE_BATTLES)))
	if draws > 0:
		push_warning("%d Kämpfe liefen ins Rundenlimit." % draws)
	# Abbrüche sind ein echtes Balance-Problem: dann heilt/verfehlt zu viel.
	return 1 if draws > SAMPLE_BATTLES / 10 else 0


# ---------------------------------------------------------------------------
# 3. Rundenturnier
# ---------------------------------------------------------------------------

func _tournament() -> void:
	var ids: Array[String] = MonsterDatabase.species_ids()
	var wins: Dictionary = {}
	var games: Dictionary = {}
	for id in ids:
		wins[id] = 0
		games[id] = 0
	var seed_counter: int = 1
	for a in ids:
		for b in ids:
			if a == b:
				continue
			seed_counter += 7919
			var res: Dictionary = _fight(a, b, TOURNAMENT_LEVEL, seed_counter)
			games[a] = int(games[a]) + 1
			games[b] = int(games[b]) + 1
			if int(res["result"]) == BattleManager.Result.PLAYER_WON:
				wins[a] = int(wins[a]) + 1
			elif int(res["result"]) == BattleManager.Result.PLAYER_LOST:
				wins[b] = int(wins[b]) + 1

	var rows: Array = []
	for id in ids:
		var played: int = maxi(1, int(games[id]))
		rows.append({
			"id": id,
			"rate": 100.0 * float(wins[id]) / float(played),
			"bst": MonsterDatabase.get_species(id).base_stat_total(),
		})
	rows.sort_custom(func(x: Dictionary, y: Dictionary) -> bool:
		return float(x["rate"]) > float(y["rate"]))
	print("  %-16s %8s %6s" % ["Art", "Siege %", "BW-Σ"])
	for row in rows:
		print("  %-16s %7.1f%% %6d" % [
			String(row["id"]), float(row["rate"]), int(row["bst"])])


# ---------------------------------------------------------------------------
# Ein Kampf, KI gegen KI
# ---------------------------------------------------------------------------

func _fight(species_a: String, species_b: String, level: int, seed_value: int) -> Dictionary:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value

	var ctx := BattleContext.new()
	ctx.is_wild = false
	ctx.allow_flee = false
	ctx.allow_catch = false
	ctx.opponent_name = "Sparringspartner"
	ctx.battle_seed = seed_value
	ctx.player_party = BattleContext.party_from(
		[MonsterInstance.create(species_a, level, rng)])
	ctx.enemy_party = BattleContext.party_from(
		[MonsterInstance.create(species_b, level, rng)])

	var manager := BattleManager.new()
	manager.start(ctx)
	var guard: int = 0
	while not manager.is_over() and guard < 2000:
		guard += 1
		if manager.phase == BattleManager.Phase.AWAIT_FORCED_SWITCH:
			var switched: bool = false
			for i in manager.player_team.size():
				if manager.player_team[i].is_alive():
					manager.submit_forced_switch(i)
					switched = true
					break
			if not switched:
				break
			continue
		if manager.phase != BattleManager.Phase.AWAIT_PLAYER:
			break
		# Der "Spieler" wird von derselben KI gesteuert -> faire Messung.
		var action: BattleAction = BattleAI.choose_action(
			manager.player_active(), manager.enemy_active(), manager.rng)
		manager.submit_player_action(action)
	var summary: Dictionary = manager.summary()
	manager.free()
	return summary
