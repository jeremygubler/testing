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
		"content": GameDatabase.content_hash,
		"team0": _team_data(team0),
		"team1": _team_data(team1),
		"mods": mods.duplicate(true),
	}


## True if a record was captured against the balance data currently loaded.
##
## A fight is only reproducible under the content it was recorded with, so a
## mismatch means "cannot judge this record here", NOT "the result was forged".
## Records from before content hashing (no "content" key) are treated as unknown
## and therefore not matching.
static func content_matches(record: Dictionary) -> bool:
	return String(record.get("content", "")) == GameDatabase.content_hash


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


## Re-run a record and confirm it produces the claimed signature. Returns false if
## the record was recorded against different content — see verify_detailed() to
## tell that case apart from an actual mismatch.
static func verify(record: Dictionary, claimed_signature: String) -> bool:
	return verify_detailed(record, claimed_signature).get("ok", false)


## Verification with a reason, so a caller (e.g. a ranked backend) can distinguish
## "this result was forged" from "this record predates the current balance patch".
## Returns {ok: bool, reason: String, signature: String}. `reason` is one of
## "ok", "content_mismatch", "signature_mismatch"; `signature` is the recomputed
## one ("" when the content did not match and no re-run was attempted).
static func verify_detailed(record: Dictionary, claimed_signature: String) -> Dictionary:
	if not content_matches(record):
		return {"ok": false, "reason": "content_mismatch", "signature": ""}
	var actual := signature(run(record))
	return {
		"ok": actual == claimed_signature,
		"reason": "ok" if actual == claimed_signature else "signature_mismatch",
		"signature": actual,
	}
