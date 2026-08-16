extends RefCounted

## Combat engagement harness (implementation; loaded at runtime by tools/engagement.gd).
##
## Where balance_impl.gd asks "how hard does a hero hit?", this asks "do fights
## actually resolve?". It runs a fixed matrix of deterministic PvE-style fights and
## reports:
##
##   timeout rate   — fights still alive at the duration cap, decided on remaining
##                    HP instead of being fought out. High values mean fights are
##                    not converging.
##   avg ticks      — mean fight length.
##   out-of-range   — unit-ticks spent alive, out of range and closing on a target.
##                    This is the movement cost of a fight: it drops when units
##                    reach their targets more directly, and it is the metric that
##                    shows what a pathfinding change is worth.
##
## Reproducible (fixed seeds), so the numbers are comparable across changes.

const ROUNDS := [6, 10, 14]
const SEEDS := 120


func run() -> void:
	GameDatabase.reload()
	var cfg: Dictionary = GameDatabase.cfg("combat", {})
	var cap := int(float(cfg.get("max_duration_sec", 30.0)) * int(cfg.get("tick_rate", 30)))

	print("=== Aetherclash engagement: %d fights, duration cap %d ticks ===" % [
		SEEDS * ROUNDS.size(), cap])

	var timeouts := 0
	var total := 0
	var tick_sum := 0
	var out_of_range := 0

	for seed_value in range(1, SEEDS + 1):
		for round_number in ROUNDS:
			var rng := DeterministicRng.new(seed_value * 31 + round_number)
			var eng := CombatEngine.new(
				OpponentFactory.build(round_number, rng),
				OpponentFactory.build(round_number, rng),
				seed_value)
			while not eng.finished:
				eng.step()
				out_of_range += _closing_units(eng)
			total += 1
			tick_sum += eng.tick
			if eng.tick >= cap:
				timeouts += 1

	print("\nfights          : %d" % total)
	print("timeouts        : %d  (%.1f%%)" % [timeouts, 100.0 * timeouts / total])
	print("avg ticks       : %.1f" % (float(tick_sum) / total))
	print("out-of-range    : %d unit-ticks" % out_of_range)


## Units that are alive, have a living target, and are not yet in range of it —
## i.e. units currently paying travel time rather than fighting.
func _closing_units(eng: CombatEngine) -> int:
	var n := 0
	for u in eng.units:
		if not u.alive:
			continue
		var tgt: CombatUnit = eng._by_slot.get(u.target_slot, null)
		if tgt == null or not tgt.alive:
			continue
		if HexGrid.distance(u.pos, tgt.pos) > u.attack_range:
			n += 1
	return n
