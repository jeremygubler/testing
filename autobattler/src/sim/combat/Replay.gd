class_name Replay
extends RefCounted

## Deterministic combat replay + verification.
##
## A match record is just the INPUT to a fight — the seed, both teams (serialized
## GameUnits), and the player's combat modifiers. Because CombatEngine is fully
## deterministic, re-running the record reproduces the exact same fight anywhere.
## That is the basis for a future ranked mode: a client submits {record, claimed
## result signature}, and a server (or peer) re-runs the record and checks the
## signature matches — cheap, self-contained anti-cheat.
##
## Everything here is JSON-safe so a record can be transmitted or stored as-is.

## Capture a fight's inputs into a record Dictionary.
static func capture(team0: Array, team1: Array, seed: int, mods: Dictionary) -> Dictionary:
	return {
		"version": 1,
		"seed": seed,
		"team0": _team_data(team0),
		"team1": _team_data(team1),
		"mods": mods.duplicate(true),
	}


static func _team_data(team: Array) -> Array:
	var out: Array = []
	for gu in team:
		out.append(gu.to_dict())
	return out


static func _rebuild_team(data: Array) -> Array:
	var out: Array = []
	var uid := 1
	for ud in data:
		var gu := GameUnit.from_dict(uid, ud)
		uid += 1
		if gu != null:
			out.append(gu)
	return out


## Re-run a record deterministically and return the combat result Dictionary.
static func run(record: Dictionary) -> Dictionary:
	var t0 := _rebuild_team(record.get("team0", []))
	var t1 := _rebuild_team(record.get("team1", []))
	var mods: Dictionary = record.get("mods", {})
	var engine := CombatEngine.new(t0, t1, int(record.get("seed", 0)), mods)
	return engine.run_to_completion()


## Canonical, compact signature of a result — what a ranked backend compares.
static func signature(result: Dictionary) -> String:
	var surv: Array = result.get("survivors", [0, 0])
	var stars: Array = result.get("surviving_stars", [0, 0])
	return "%d|%d|%d,%d|%d,%d" % [
		int(result.get("winner", -1)), int(result.get("ticks", 0)),
		int(surv[0]), int(surv[1]), int(stars[0]), int(stars[1])]


## Re-run a record and confirm it produces the claimed signature.
static func verify(record: Dictionary, claimed_signature: String) -> bool:
	return signature(run(record)) == claimed_signature
