class_name BattleManager
extends Node

## Der Regel-Kern des rundenbasierten Kampfes -- 1 gegen 1 mit Auswechseln.
##
## [b]Design-Prinzipien[/b]
## 1. [i]Kein UI-Wissen.[/i] Der Manager sendet nur Signale ([signal message],
##    [signal hp_changed], ...). Ob eine schicke Oberfläche oder ein Testskript
##    zuhört, ist ihm gleich -- deshalb ist der Kampf headless simulierbar.
## 2. [i]Synchron.[/i] [method submit_player_action] rechnet die komplette Runde
##    durch und kehrt zurück. Keine `await`-Ketten im Regelwerk; das Pacing
##    (Textboxen) macht allein die UI.
## 3. [i]Deterministisch.[/i] Aller Zufall kommt aus [member rng]. Gleicher Seed
##    + gleiche Aktionen = exakt gleicher Kampf.
##
## [b]Ablauf einer Runde[/b]
## [codeblock]
## submit_player_action(action)
##   -> KI wählt ihre Aktion
##   -> Reihenfolge: Priorität, dann Initiative, dann RNG
##   -> Aktionen ausführen (Abbruch, sobald der Kampf entschieden ist)
##   -> Rundenende: Statusschaden (Gift/Verbrennung)
##   -> K.O.-Prüfung: EP vergeben, nachsenden, ggf. Zwangswechsel
##   -> nächste Runde oder battle_ended
## [/codeblock]

enum Side { PLAYER, ENEMY }

enum Phase {
	SETUP,
	AWAIT_PLAYER,        ## warten auf submit_player_action()
	RESOLVING,           ## Runde läuft gerade
	AWAIT_FORCED_SWITCH, ## aktives Monster besiegt -> submit_forced_switch()
	ENDED,
}

enum Result { ONGOING, PLAYER_WON, PLAYER_LOST, FLED, CAUGHT, DRAW }

signal battle_started(context: BattleContext)
## Eine Zeile fürs Kampflog. Die UI puffert und zeigt sie getaktet an.
signal message(text: String)
signal turn_started(turn: int)
signal awaiting_player_action()
signal awaiting_forced_switch()
## Neues Monster im Feld (Wechsel oder Nachsenden).
signal combatant_changed(side: int, combatant: BattleCombatant)
signal hp_changed(side: int, combatant: BattleCombatant)
signal status_changed(side: int, combatant: BattleCombatant)
signal experience_gained(monster: MonsterInstance, amount: int)
signal battle_ended(result: int, summary: Dictionary)

var context: BattleContext = null
var rng: RandomNumberGenerator = RandomNumberGenerator.new()
var player_team: Array[BattleCombatant] = []
var enemy_team: Array[BattleCombatant] = []
var player_index: int = 0
var enemy_index: int = 0
var turn: int = 0
var phase: Phase = Phase.SETUP
var result: Result = Result.ONGOING

var _flee_attempts: int = 0
## Party-Indizes, die gegen das aktuelle Gegnermonster im Feld standen
## (bekommen EP, wenn es besiegt wird).
var _participants: Dictionary = {}
var _caught_monster: MonsterInstance = null
var _log: Array[String] = []


# ---------------------------------------------------------------------------
# Start
# ---------------------------------------------------------------------------

## Baut den Kampf auf und startet die erste Runde.
func start(ctx: BattleContext) -> void:
	context = ctx
	rng = RandomNumberGenerator.new()
	rng.seed = ctx.resolve_seed()

	player_team = _build_team(_resolve_player_party(ctx), Side.PLAYER)
	enemy_team = _build_team(ctx.enemy_party, Side.ENEMY)
	if player_team.is_empty() or enemy_team.is_empty():
		push_error("[BattleManager] Kampf ohne Teams kann nicht starten.")
		result = Result.DRAW
		phase = Phase.ENDED
		battle_ended.emit(int(result), _summary())
		return

	player_index = maxi(0, _next_alive_index(player_team, -1))
	enemy_index = maxi(0, _next_alive_index(enemy_team, -1))
	turn = 0
	result = Result.ONGOING
	_flee_attempts = 0
	_caught_monster = null
	_log.clear()
	_reset_participants()

	phase = Phase.SETUP
	battle_started.emit(ctx)
	if ctx.is_wild:
		_say("Ein wildes %s greift an!" % enemy_active().name())
	else:
		_say("%s schickt %s in den Kampf!" % [ctx.enemy_label(), enemy_active().name()])
	_say("Los, %s!" % player_active().name())
	combatant_changed.emit(int(Side.ENEMY), enemy_active())
	combatant_changed.emit(int(Side.PLAYER), player_active())
	_begin_turn()


func _resolve_player_party(ctx: BattleContext) -> Array[MonsterInstance]:
	if not ctx.player_party.is_empty():
		return ctx.player_party
	return GameState.battle_party()


func _build_team(monsters: Array[MonsterInstance], side: int) -> Array[BattleCombatant]:
	var out: Array[BattleCombatant] = []
	for i in monsters.size():
		if monsters[i] != null:
			out.append(BattleCombatant.create(monsters[i], side, i))
	return out


# ---------------------------------------------------------------------------
# Abfragen für die UI
# ---------------------------------------------------------------------------

func player_active() -> BattleCombatant:
	return player_team[player_index] if player_index < player_team.size() else null


func enemy_active() -> BattleCombatant:
	return enemy_team[enemy_index] if enemy_index < enemy_team.size() else null


func is_over() -> bool:
	return phase == Phase.ENDED


## Team-Indizes, auf die gewechselt werden kann (lebend und nicht im Feld).
func available_switch_indices() -> Array[int]:
	var out: Array[int] = []
	for i in player_team.size():
		if i != player_index and player_team[i].is_alive():
			out.append(i)
	return out


func can_flee() -> bool:
	return context != null and context.allow_flee


func can_catch() -> bool:
	return context != null and context.allow_catch and context.is_wild


## Komplettes Kampflog (praktisch für Tests und Bug-Reports).
func log_lines() -> Array[String]:
	return _log.duplicate()


## Ergebnisübersicht -- identisch zu dem Dictionary aus [signal battle_ended].
func summary() -> Dictionary:
	return _summary()


# ---------------------------------------------------------------------------
# Runden-Ablauf
# ---------------------------------------------------------------------------

func _begin_turn() -> void:
	turn += 1
	var max_turns: int = MonsterDatabase.cfg_int("combat/max_turns", 300)
	if turn > max_turns:
		_say("Der Kampf wird abgebrochen (Rundenlimit).")
		_finish(Result.DRAW)
		return
	_mark_participant()
	player_active().turns_active += 1
	enemy_active().turns_active += 1
	phase = Phase.AWAIT_PLAYER
	turn_started.emit(turn)
	awaiting_player_action.emit()


## Nimmt die Spieleraktion an und rechnet die ganze Runde durch.
## Rückgabe: false, wenn der Kampf gerade keine Aktion erwartet.
func submit_player_action(action: BattleAction) -> bool:
	if phase != Phase.AWAIT_PLAYER:
		push_warning("[BattleManager] Aktion ignoriert (Phase %d)." % int(phase))
		return false
	if action == null:
		return false
	phase = Phase.RESOLVING

	var enemy_action: BattleAction = BattleAI.choose_action(
		enemy_active(), player_active(), rng, context.ai_level)

	for entry in _order_actions(action, enemy_action):
		if result != Result.ONGOING:
			break
		var actor: BattleCombatant = entry["actor"]
		# Wer in dieser Runde schon besiegt wurde, handelt nicht mehr.
		if not actor.is_alive():
			continue
		_perform(actor, entry["action"] as BattleAction)
		_resolve_faints()
		if phase == Phase.AWAIT_FORCED_SWITCH:
			return true

	if result != Result.ONGOING:
		return true

	_end_of_turn()
	_resolve_faints()
	if result != Result.ONGOING or phase == Phase.AWAIT_FORCED_SWITCH:
		return true

	_begin_turn()
	return true


## Nach einem K.O. muss der Spieler ein neues Monster schicken.
func submit_forced_switch(party_index: int) -> bool:
	if phase != Phase.AWAIT_FORCED_SWITCH:
		return false
	if party_index < 0 or party_index >= player_team.size():
		return false
	if not player_team[party_index].is_alive():
		return false
	_switch_player_to(party_index, true)
	# Der Rest der Runde verfällt -- der Wechsel *ist* der Zug.
	_begin_turn()
	return true


## Sortiert die beiden Aktionen: Priorität, dann Initiative, dann RNG.
func _order_actions(player_action: BattleAction, enemy_action: BattleAction) -> Array:
	var entries: Array = [
		{
			"actor": player_active(), "action": player_action,
			"priority": _action_priority(player_active(), player_action),
			"speed": player_active().effective_speed(),
		},
		{
			"actor": enemy_active(), "action": enemy_action,
			"priority": _action_priority(enemy_active(), enemy_action),
			"speed": enemy_active().effective_speed(),
		},
	]
	var coin: int = rng.randi_range(0, 1)
	entries.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if int(a["priority"]) != int(b["priority"]):
			return int(a["priority"]) > int(b["priority"])
		if int(a["speed"]) != int(b["speed"]):
			return int(a["speed"]) > int(b["speed"])
		# Gleichstand: Münzwurf aus dem Kampf-RNG (bleibt deterministisch).
		return coin == 0)
	return entries


func _action_priority(actor: BattleCombatant, action: BattleAction) -> int:
	var switch_priority: int = MonsterDatabase.cfg_int("combat/switch_priority", 6)
	match action.kind:
		BattleAction.Kind.FLEE:
			return switch_priority + 1
		BattleAction.Kind.ITEM, BattleAction.Kind.SWITCH:
			return switch_priority
		_:
			var move: MoveDefinition = actor.move_at(action.move_index)
			return move.priority if move != null else 0


func _perform(actor: BattleCombatant, action: BattleAction) -> void:
	match action.kind:
		BattleAction.Kind.FLEE:
			_perform_flee(actor)
		BattleAction.Kind.SWITCH:
			_perform_switch(actor, action.target_index)
		BattleAction.Kind.ITEM:
			_perform_item(actor, action)
		_:
			_perform_attack(actor, _opponent_of(actor), action)


func _opponent_of(actor: BattleCombatant) -> BattleCombatant:
	return enemy_active() if actor.side == Side.PLAYER else player_active()


# ---------------------------------------------------------------------------
# Aktionen
# ---------------------------------------------------------------------------

func _perform_attack(actor: BattleCombatant, target: BattleCombatant,
		action: BattleAction) -> void:
	if action.move_index < 0:
		_say("%s hat keine Attacke mehr übrig und zögert." % actor.name())
		return
	var slot: MoveSlot = actor.move_slot(action.move_index)
	if slot == null or not slot.is_usable():
		_say("%s kann diese Attacke nicht einsetzen." % actor.name())
		return
	if not _check_can_act(actor):
		return

	var move: MoveDefinition = slot.definition()
	slot.pp -= 1
	_say("%s setzt %s ein!" % [actor.name(), move.display_name])

	if not move.is_damaging():
		if not DamageCalculator.accuracy_check(move, rng):
			_say("Die Attacke misslingt.")
			return
		_apply_move_effect(actor, target, move, 0)
		return

	var roll: Dictionary = DamageCalculator.compute(actor, target, move, rng)
	if not bool(roll["hit"]):
		_say("%s weicht aus!" % target.name())
		return
	var effectiveness: float = float(roll["effectiveness"])
	if effectiveness <= 0.0:
		_say("Es hat keine Wirkung auf %s ..." % target.name())
		return

	var damage: int = int(roll["damage"])
	target.monster.apply_hp_delta(-damage)
	hp_changed.emit(target.side, target)
	if bool(roll["critical"]):
		_say("Ein Volltreffer!")
	var eff_text: String = DamageCalculator.effectiveness_text(effectiveness)
	if eff_text != "":
		_say(eff_text)
	_say("%s verliert %d KP (%d/%d)." % [
		target.name(), damage, target.hp(), target.max_hp()])

	# Zusatzeffekt erst nach dem Schaden -- und nur, wenn das Ziel noch steht
	# (Ausnahme: Effekte auf den Anwender selbst).
	if target.is_alive() or move.targets_self:
		if move.effect != MoveEffects.Effect.NONE \
				and rng.randf() * 100.0 < float(move.effect_chance):
			_apply_move_effect(actor, target, move, damage)


## Prüft Schlaf/Paralyse. Rückgabe: false, wenn der Zug ausfällt.
func _check_can_act(actor: BattleCombatant) -> bool:
	var st: int = actor.status()
	if st == StatusAilments.Status.SLEEP:
		actor.monster.sleep_turns -= 1
		if actor.monster.sleep_turns <= 0:
			actor.monster.status = StatusAilments.Status.NONE
			actor.monster.sleep_turns = 0
			status_changed.emit(actor.side, actor)
			_say("%s wacht auf!" % actor.name())
		else:
			_say("%s schläft tief und fest." % actor.name())
			return false
	if st == StatusAilments.Status.PARALYZE:
		var skip: float = MonsterDatabase.cfg_float("combat/paralyze_skip_chance", 0.25)
		if rng.randf() < skip:
			_say("%s ist paralysiert und kann sich nicht rühren!" % actor.name())
			return false
	return true


func _apply_move_effect(actor: BattleCombatant, target: BattleCombatant,
		move: MoveDefinition, damage_dealt: int) -> void:
	var subject: BattleCombatant = actor if move.targets_self else target
	match move.effect:
		MoveEffects.Effect.STAT_CHANGE:
			var changed: int = subject.change_stage(int(move.effect_stat), move.effect_stages)
			var stat_label: String = Stats.label(int(move.effect_stat))
			if changed == 0:
				_say("%s: %s lässt sich nicht weiter ändern." % [subject.name(), stat_label])
			elif changed > 0:
				_say("%s: %s steigt!" % [subject.name(), stat_label])
			else:
				_say("%s: %s sinkt!" % [subject.name(), stat_label])
		MoveEffects.Effect.INFLICT_STATUS:
			_inflict_status(subject, int(move.effect_status))
		MoveEffects.Effect.DRAIN:
			var drained: int = maxi(1, int(round(float(damage_dealt) * move.effect_ratio)))
			if actor.monster.apply_hp_delta(drained) != 0:
				hp_changed.emit(actor.side, actor)
				_say("%s saugt Energie ab." % actor.name())
		MoveEffects.Effect.RECOIL:
			var recoil: int = maxi(1, int(round(float(damage_dealt) * move.effect_ratio)))
			actor.monster.apply_hp_delta(-recoil)
			hp_changed.emit(actor.side, actor)
			_say("%s nimmt %d KP Rückstoß." % [actor.name(), recoil])
		MoveEffects.Effect.HEAL:
			var heal: int = maxi(1, int(round(float(actor.max_hp()) * move.effect_ratio)))
			if actor.monster.apply_hp_delta(heal) != 0:
				hp_changed.emit(actor.side, actor)
				_say("%s erholt sich." % actor.name())
			else:
				_say("%s ist bereits bei voller Kraft." % actor.name())
		_:
			pass


func _inflict_status(subject: BattleCombatant, status: int) -> void:
	if status == StatusAilments.Status.NONE:
		return
	if subject.status() != StatusAilments.Status.NONE:
		_say("%s ist bereits %s." % [
			subject.name(), StatusAilments.long_label(subject.status())])
		return
	subject.monster.status = status as StatusAilments.Status
	if status == StatusAilments.Status.SLEEP:
		subject.monster.sleep_turns = rng.randi_range(
			MonsterDatabase.cfg_int("combat/sleep_min_turns", 1),
			MonsterDatabase.cfg_int("combat/sleep_max_turns", 3))
	status_changed.emit(subject.side, subject)
	_say("%s ist jetzt %s!" % [subject.name(), StatusAilments.long_label(status)])


func _perform_switch(actor: BattleCombatant, target_index: int) -> void:
	if actor.side != Side.PLAYER:
		return # Gegner-Wechsel macht dieses Grundgerüst nicht.
	if target_index < 0 or target_index >= player_team.size() \
			or target_index == player_index \
			or not player_team[target_index].is_alive():
		_say("Der Wechsel ist nicht möglich.")
		return
	_switch_player_to(target_index, false)


func _switch_player_to(target_index: int, forced: bool) -> void:
	var outgoing: BattleCombatant = player_active()
	if outgoing != null and not forced:
		_say("%s, komm zurück!" % outgoing.name())
	if outgoing != null:
		outgoing.reset_volatile()
	player_index = target_index
	player_active().reset_volatile()
	_mark_participant()
	_say("Los, %s!" % player_active().name())
	phase = Phase.RESOLVING
	combatant_changed.emit(int(Side.PLAYER), player_active())


func _perform_item(actor: BattleCombatant, action: BattleAction) -> void:
	if actor.side != Side.PLAYER:
		return
	var item: ItemDefinition = MonsterDatabase.get_item(action.item_id)
	if item == null or not GameState.has_item(action.item_id):
		_say("Dieser Gegenstand ist nicht verfügbar.")
		return
	if item.kind == ItemDefinition.Kind.CAPTURE:
		_attempt_capture(item)
		return

	var target_index: int = action.target_index if action.target_index >= 0 else player_index
	if target_index >= player_team.size():
		_say("Kein gültiges Ziel.")
		return
	var target: BattleCombatant = player_team[target_index]
	var applied: bool = false
	match item.kind:
		ItemDefinition.Kind.HEAL_HP:
			if not target.is_alive():
				_say("%s ist besiegt -- das hilft nicht." % target.name())
			elif target.hp() >= target.max_hp():
				_say("%s hat volle KP." % target.name())
			else:
				var healed: int = target.monster.apply_hp_delta(
					item.heal_amount_for(target.monster))
				hp_changed.emit(target.side, target)
				_say("%s stellt %d KP bei %s wieder her." % [
					item.display_name, healed, target.name()])
				applied = true
		ItemDefinition.Kind.CURE_STATUS:
			if target.status() == StatusAilments.Status.NONE:
				_say("%s hat kein Statusproblem." % target.name())
			else:
				target.monster.status = StatusAilments.Status.NONE
				target.monster.sleep_turns = 0
				status_changed.emit(target.side, target)
				_say("%s ist wieder gesund." % target.name())
				applied = true
		ItemDefinition.Kind.REVIVE:
			if target.is_alive():
				_say("%s ist nicht besiegt." % target.name())
			else:
				var revive_hp: int = maxi(1, int(round(
					maxf(item.ratio, 0.5) * float(target.max_hp()))))
				target.monster.current_hp = mini(revive_hp, target.max_hp())
				hp_changed.emit(target.side, target)
				_say("%s ist wieder kampfbereit!" % target.name())
				applied = true
		_:
			_say("Dieser Gegenstand wirkt hier nicht.")
	if applied:
		GameState.remove_item(action.item_id, 1)


func _attempt_capture(item: ItemDefinition) -> void:
	if not can_catch():
		_say("Hier lässt sich nichts fangen!")
		return
	GameState.remove_item(item.id, 1)
	var target: BattleCombatant = enemy_active()
	var chance: float = capture_chance(target, item)
	_say("Du wirfst %s!" % item.display_name)
	if rng.randf() < chance:
		_say("%s wurde gefangen!" % target.name())
		_caught_monster = target.monster
		var joined: bool = GameState.add_to_party(target.monster)
		if not joined:
			_say("Das Team ist voll -- %s wandert in die Box." % target.name())
		_finish(Result.CAUGHT)
	else:
		_say("%s hat sich befreit!" % target.name())


## Fangchance: Basisrate der Art, verstärkt durch niedrige KP, Statusprobleme
## und die Qualität des Fanggegenstands, gedämpft durch hohes Level.
func capture_chance(target: BattleCombatant, item: ItemDefinition) -> float:
	var species: MonsterSpecies = target.monster.species()
	if species == null:
		return 0.0
	var base: float = float(species.catch_rate) / 255.0
	var hp_weight: float = MonsterDatabase.cfg_float("capture/hp_weight", 0.66)
	var hp_term: float = 1.0 + hp_weight * (1.0 - target.hp_ratio())
	var status_bonus: float = StatusAilments.catch_bonus(target.status())
	var level_term: float = clampf(1.2 - float(target.monster.level) / 100.0, 0.5, 1.2)
	return clampf(base * item.catch_multiplier * hp_term * status_bonus * level_term,
		MonsterDatabase.cfg_float("capture/min_chance", 0.03),
		MonsterDatabase.cfg_float("capture/max_chance", 0.95))


func _perform_flee(actor: BattleCombatant) -> void:
	if actor.side != Side.PLAYER:
		return
	if not can_flee():
		_say("Vor diesem Gegner kann man nicht fliehen!")
		return
	_flee_attempts += 1
	if rng.randf() < flee_chance():
		_say("Du entkommst!")
		_finish(Result.FLED)
	else:
		_say("Die Flucht misslingt!")


## Fluchtchance: Basiswert + Initiativvorteil + Bonus je Fehlversuch.
func flee_chance() -> float:
	var base: float = MonsterDatabase.cfg_float("flee/base_chance", 0.30)
	var weight: float = MonsterDatabase.cfg_float("flee/speed_weight", 0.35)
	var bonus: float = MonsterDatabase.cfg_float("flee/attempt_bonus", 0.15)
	var own: float = float(player_active().effective_speed())
	var foe: float = maxf(1.0, float(enemy_active().effective_speed()))
	var ratio: float = clampf(own / foe - 1.0, -0.5, 1.0)
	return clampf(base + weight * ratio + bonus * float(maxi(0, _flee_attempts - 1)),
		0.05, 0.95)


# ---------------------------------------------------------------------------
# Rundenende, K.O., Belohnungen
# ---------------------------------------------------------------------------

## Statusschaden am Rundenende, in Initiativ-Reihenfolge.
func _end_of_turn() -> void:
	var order: Array[BattleCombatant] = [player_active(), enemy_active()]
	if enemy_active().effective_speed() > player_active().effective_speed():
		order = [enemy_active(), player_active()]
	for c in order:
		if not c.is_alive():
			continue
		var st: int = c.status()
		if not StatusAilments.TICK_FRACTION.has(st):
			continue
		var fraction: float = float(StatusAilments.TICK_FRACTION[st])
		var dmg: int = maxi(1, int(round(float(c.max_hp()) * fraction)))
		c.monster.apply_hp_delta(-dmg)
		hp_changed.emit(c.side, c)
		_say("%s leidet unter %s (-%d KP)." % [
			c.name(), StatusAilments.long_label(st), dmg])


## Wickelt K.O.s ab: EP, Nachsenden, Zwangswechsel, Kampfende.
func _resolve_faints() -> void:
	if result != Result.ONGOING:
		return

	if not enemy_active().is_alive():
		var defeated: BattleCombatant = enemy_active()
		_say("%s wurde besiegt!" % defeated.name())
		_award_experience(defeated)
		var next_enemy: int = _next_alive_index(enemy_team, enemy_index)
		if next_enemy < 0:
			_on_victory()
			return
		enemy_index = next_enemy
		enemy_active().reset_volatile()
		_reset_participants()
		_say("%s schickt %s!" % [context.enemy_label(), enemy_active().name()])
		combatant_changed.emit(int(Side.ENEMY), enemy_active())

	if not player_active().is_alive():
		_say("%s wurde besiegt!" % player_active().name())
		if _next_alive_index(player_team, player_index) < 0:
			_say("Du hast keine kampffähigen Monster mehr ...")
			_finish(Result.PLAYER_LOST)
			return
		phase = Phase.AWAIT_FORCED_SWITCH
		awaiting_forced_switch.emit()


func _on_victory() -> void:
	if context.money_reward > 0:
		GameState.add_money(context.money_reward)
		_say("Du erhältst %d Münzen." % context.money_reward)
	_finish(Result.PLAYER_WON)


## Verteilt EP auf alle Teilnehmer, wickelt Levelaufstiege und Entwicklungen ab.
func _award_experience(defeated: BattleCombatant) -> void:
	var species: MonsterSpecies = defeated.monster.species()
	var base_exp: int = species.base_exp if species != null else 50
	var divisor: float = maxf(1.0, MonsterDatabase.cfg_float("experience/yield_divisor", 7.0))
	var total: int = maxi(1, int(round(
		float(base_exp) * float(defeated.monster.level) / divisor)))

	var receivers: Array[int] = []
	for key in _participants.keys():
		var idx: int = int(key)
		if idx < player_team.size() and player_team[idx].is_alive():
			receivers.append(idx)
	if receivers.is_empty():
		return
	var share: int = maxi(1, int(round(float(total) / float(receivers.size()))))

	for idx in receivers:
		var mon: MonsterInstance = player_team[idx].monster
		var events: Array[Dictionary] = mon.gain_experience(share)
		experience_gained.emit(mon, share)
		_say("%s erhält %d EP." % [mon.display_name(), share])
		for ev in events:
			_say("%s erreicht Level %d!" % [mon.display_name(), int(ev["level"])])
			for learned in (ev.get("learned", []) as Array):
				_say("%s lernt %s!" % [
					mon.display_name(), (learned as MoveDefinition).display_name])
			var evolved: MonsterSpecies = mon.try_evolve()
			if evolved != null:
				_say("%s entwickelt sich zu %s!" % [
					mon.display_name(), evolved.display_name])
		hp_changed.emit(player_team[idx].side, player_team[idx])


func _finish(new_result: Result) -> void:
	result = new_result
	phase = Phase.ENDED
	battle_ended.emit(int(result), _summary())


func _summary() -> Dictionary:
	return {
		"result": int(result),
		"result_name": Result.keys()[int(result)],
		"turns": turn,
		"seed": context.battle_seed if context != null else 0,
		"caught_species": _caught_monster.species_id if _caught_monster != null else "",
		"player_survivors": _alive_count(player_team),
		"enemy_survivors": _alive_count(enemy_team),
		"log": _log.duplicate(),
	}


# ---------------------------------------------------------------------------
# Interna
# ---------------------------------------------------------------------------

func _mark_participant() -> void:
	_participants[player_index] = true


func _reset_participants() -> void:
	_participants.clear()
	_mark_participant()


func _next_alive_index(team: Array[BattleCombatant], after: int) -> int:
	for i in team.size():
		if i != after and team[i].is_alive():
			return i
	return -1


func _alive_count(team: Array[BattleCombatant]) -> int:
	var n: int = 0
	for c in team:
		if c.is_alive():
			n += 1
	return n


func _say(text: String) -> void:
	_log.append(text)
	message.emit(text)
