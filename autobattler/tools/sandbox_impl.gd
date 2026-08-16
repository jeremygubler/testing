extends RefCounted

## Sandbox implementation, loaded at RUNTIME by tools/sandbox.gd so autoloads are
## available (the `-s` entry script cannot reference them). Runs a deterministic
## combat demo + the mock-store cosmetics flow.

const SEED := 1337


func run() -> void:
	GameDatabase.reload()
	if PlatformServices.store == null:
		PlatformServices._resolve_platform()

	print("=== Aetherclash combat sandbox (seed %d) ===" % SEED)
	_run_combat_demo()
	print("\n=== Cosmetics / mock-store demo ===")
	_run_cosmetics_demo()


func _make_unit(uid: int, hero_id: String, star: int, col: int, row: int) -> GameUnit:
	var hero := GameDatabase.get_hero(hero_id)
	assert(hero != null, "unknown hero id: %s" % hero_id)
	var gu := GameUnit.new(uid, hero, star)
	gu.board_pos = Vector2i(col, row)
	return gu


func _run_combat_demo() -> void:
	var team_a: Array = [
		_make_unit(1, "gravik", 2, 3, 0),
		_make_unit(2, "cinderos", 2, 2, 1),
		_make_unit(3, "zephyra", 2, 4, 3),
		_make_unit(4, "nerida", 2, 1, 2),
	]
	var team_b: Array = [
		_make_unit(11, "boulderon", 2, 3, 0),
		_make_unit(12, "nyx", 2, 2, 1),
		_make_unit(13, "rimeheart", 2, 4, 3),
		_make_unit(14, "solara", 2, 1, 2),
	]

	var engine := CombatEngine.new(team_a, team_b, SEED)
	var log_ticks := {}
	while not engine.finished:
		engine.step()
		for ev in engine.events:
			if ev.get("type") in ["cast", "death"]:
				log_ticks[engine.tick] = log_ticks.get(engine.tick, [])
				log_ticks[engine.tick].append(ev)

	var keys := log_ticks.keys()
	keys.sort()
	for t in keys:
		for ev in log_ticks[t]:
			print("  t=%4d  %s" % [t, ev])

	var r := engine.result
	var winner_idx: int = r.winner if int(r.winner) >= 0 else 2
	print("Result: winner=%s  ticks=%d  elapsed=%.1fs  survivors=%s  surviving_stars=%s" % [
		["team_a", "team_b", "draw"][winner_idx],
		r.ticks, r.elapsed, r.survivors, r.surviving_stars])

	# Determinism check: re-run and compare.
	var r2 := CombatEngine.new(team_a, team_b, SEED).run_to_completion()
	var same: bool = int(r.winner) == int(r2.winner) and int(r.ticks) == int(r2.ticks)
	print("Determinism re-run: %s (winner=%s ticks=%d)" % ["OK" if same else "MISMATCH", r2.winner, r2.ticks])


func _run_cosmetics_demo() -> void:
	var store := PlatformServices.store
	var ent := PlatformServices.entitlements
	var products := store.get_available_products()
	print("Store has %d cosmetic products." % products.size())
	if products.is_empty():
		return
	var pid: String = products[0]
	var skin := GameDatabase.get_skin(pid)
	print("Buying '%s' (%s, %s) ..." % [skin.name, skin.rarity, store.get_price_display(pid)])
	store.purchase(pid)  # mock grants the entitlement synchronously
	print("  owns('%s') = %s" % [pid, ent.owns(pid)])
	if skin.type == "hero" and skin.hero_id != "":
		var ok := ent.apply_skin(skin.hero_id, pid)
		print("  applied to '%s' = %s (current: %s)" % [skin.hero_id, ok, ent.get_applied_skin(skin.hero_id)])
	print("  total owned entitlements: %d" % ent.owned_ids().size())
