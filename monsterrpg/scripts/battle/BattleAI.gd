class_name BattleAI
extends RefCounted

## Gegner-Entscheidungslogik. Absichtlich klein und heuristisch -- sie ist der
## Platzhalter, den du später gegen eine richtige KI tauschst.
##
## Sie benutzt genau dieselbe [BattleAction]-Schnittstelle wie die Spieler-UI,
## damit man einen Kampf auch KI-gegen-KI laufen lassen kann (siehe
## `tools/battle_sim.gd`).

enum Level {
	RANDOM, ## wählt gleichverteilt eine benutzbare Attacke
	GREEDY, ## wählt die Attacke mit dem höchsten erwarteten Schaden
}


## Bestimmt die Aktion für [param actor] gegen [param target].
static func choose_action(actor: BattleCombatant, target: BattleCombatant,
		rng: RandomNumberGenerator, level: Level = Level.GREEDY) -> BattleAction:
	var usable: Array[int] = _usable_move_indices(actor)
	if usable.is_empty():
		# Keine PP mehr: der Manager behandelt move_index == -1 als "kraftlos".
		return BattleAction.attack(-1)
	if level == Level.RANDOM:
		return BattleAction.attack(usable[rng.randi_range(0, usable.size() - 1)])

	var best_index: int = usable[0]
	var best_score: float = -1.0
	for idx in usable:
		var move: MoveDefinition = actor.move_at(idx)
		var score: float = _score_move(actor, target, move)
		# Kleine Streuung, damit die KI nicht komplett vorhersehbar spielt.
		score *= rng.randf_range(0.92, 1.08)
		if score > best_score:
			best_score = score
			best_index = idx
	return BattleAction.attack(best_index)


static func _usable_move_indices(actor: BattleCombatant) -> Array[int]:
	var out: Array[int] = []
	for i in actor.monster.moves.size():
		var slot: MoveSlot = actor.monster.moves[i]
		if slot != null and slot.is_usable():
			out.append(i)
	return out


## Heuristik: Schaden zählt direkt, Statusattacken bekommen einen Ersatzwert,
## damit die KI sie benutzt -- aber nicht endlos wiederholt.
static func _score_move(actor: BattleCombatant, target: BattleCombatant,
		move: MoveDefinition) -> float:
	if move.is_damaging():
		var dmg: float = DamageCalculator.expected_damage(actor, target, move)
		# Ein tödlicher Treffer ist mehr wert als reiner Schaden.
		if dmg >= float(target.hp()):
			return dmg * 1.5
		return dmg
	var reference: float = maxf(1.0, float(target.max_hp()) * 0.12)
	match move.effect:
		MoveEffects.Effect.INFLICT_STATUS:
			# Nur sinnvoll, wenn das Ziel noch keinen Status hat.
			if target.status() != StatusAilments.Status.NONE:
				return 0.0
			return reference * 1.2
		MoveEffects.Effect.HEAL:
			# Heilen lohnt sich erst, wenn wirklich KP fehlen.
			return reference * 2.0 * (1.0 - actor.hp_ratio())
		MoveEffects.Effect.STAT_CHANGE:
			var stat: int = int(move.effect_stat)
			var current: int = actor.stage(stat) if move.targets_self \
				else target.stage(stat)
			# Am Limit bringt eine weitere Stufe nichts.
			if absi(current) >= Stats.STAGE_MAX:
				return 0.0
			return reference * (0.9 - 0.15 * float(absi(current)))
		_:
			return reference * 0.5
