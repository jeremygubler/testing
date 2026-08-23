extends RefCounted

## Deterministische Testsuite für Datenbank, Statuswerte, Kampf, Party und
## Speicherstände.
##
## Winziges eigenes Framework: [method _run] registriert einen Test,
## [method _check] / [method _eq] / [method _approx] sind die Zusicherungen.
## Es gibt keinen CLI-Filter -- um einen Test isoliert laufen zu lassen, die
## anderen `_run(...)`-Zeilen in [method run] kurz auskommentieren.

var _failures: int = 0
var _checks: int = 0
var _current: String = ""
## Sicherungskopie des GameState, damit Tests sich nicht gegenseitig stören.
var _state_backup: Dictionary = {}


func run() -> int:
	print("=== Monster-RPG Testsuite ===")
	_state_backup = GameState.to_dict()

	_run("Datenbank vollständig", test_database_loaded)
	_run("Lernlisten & Entwicklungen auflösbar", test_content_references)
	_run("Typenmatrix", test_type_chart)
	_run("Statuswert-Mathematik", test_stat_math)
	_run("EP-Kurve & Levelaufstieg", test_experience)
	_run("Entwicklung", test_evolution)
	_run("Team-Verwaltung (max. 6)", test_party_limits)
	_run("Inventar", test_inventory)
	_run("Speichern/Laden (JSON)", test_save_json)
	_run("Speichern/Laden (.tres)", test_save_tres)
	_run("Schadensformel", test_damage_formula)
	_run("Statusprobleme", test_status_effects)
	_run("Zugreihenfolge (Priorität)", test_turn_order)
	_run("Kompletter Kampf endet", test_battle_completes)
	_run("Kampf ist deterministisch", test_battle_determinism)
	_run("Flucht & Fangen", test_flee_and_capture)
	_run("Begegnungstabelle", test_encounter_table)

	GameState.from_dict(_state_backup)
	print("\n%d Zusicherungen, %d Fehler" % [_checks, _failures])
	print("=== %s ===" % ("BESTANDEN" if _failures == 0 else "FEHLGESCHLAGEN"))
	return _failures


# ---------------------------------------------------------------------------
# Inhalte
# ---------------------------------------------------------------------------

func test_database_loaded() -> void:
	_check(MonsterDatabase.is_loaded(), "Datenbank geladen")
	_check(MonsterDatabase.species_ids().size() >= 12,
		"mindestens 12 Arten (%d)" % MonsterDatabase.species_ids().size())
	_check(MonsterDatabase.move_ids().size() >= 20,
		"mindestens 20 Attacken (%d)" % MonsterDatabase.move_ids().size())
	_check(MonsterDatabase.item_ids().size() >= 4,
		"mindestens 4 Items (%d)" % MonsterDatabase.item_ids().size())
	_check(MonsterDatabase.encounter_table_ids().size() >= 2, "mindestens 2 Zonen")
	_eq(MonsterDatabase.max_party_size(), 6, "Teamgröße aus game_config")
	_eq(MonsterDatabase.max_moves(), 4, "Attacken pro Monster")


func test_content_references() -> void:
	for species in MonsterDatabase.all_species():
		_check(species.id != "", "Art hat eine ID")
		_check(species.display_name != "", "%s hat einen Namen" % species.id)
		_check(not species.learnset.is_empty(), "%s hat eine Lernliste" % species.id)
		var starters: Array[MoveDefinition] = species.moves_up_to_level(1)
		_check(not starters.is_empty(), "%s kennt auf Level 1 eine Attacke" % species.id)
		for entry in species.learnset:
			_check(entry.move != null, "%s: Lernlisten-Eintrag hat eine Attacke"
				% species.id)
		if species.evolves_into != "":
			_check(MonsterDatabase.get_species(species.evolves_into) != null,
				"%s: Entwicklung '%s' existiert" % [species.id, species.evolves_into])
			_check(species.evolve_level > 0, "%s: Entwicklungslevel gesetzt" % species.id)
	for move in MonsterDatabase.all_moves():
		_check(move.id != "", "Attacke hat eine ID")
		if move.category == MoveDefinition.Category.STATUS:
			_eq(move.power, 0, "%s: Statusattacke ohne Power" % move.id)
		else:
			_check(move.power > 0, "%s: Angriffsattacke hat Power" % move.id)


func test_type_chart() -> void:
	var chart: Dictionary = MonsterDatabase.type_chart()
	_eq(chart.size(), Elements.count(), "Matrix enthält jeden Angriffstyp")
	for attacker in Elements.count():
		for defender in Elements.count():
			var value: float = MonsterDatabase.type_multiplier(attacker, defender)
			_check(value == 0.0 or value == 0.5 or value == 1.0 or value == 2.0,
				"%s->%s ist 0/0.5/1/2 (war %.2f)" % [
					Elements.key(attacker), Elements.key(defender), value])
	# Stichproben aus data/type_chart.json
	_approx(MonsterDatabase.type_multiplier(Elements.Kind.EMBER, Elements.Kind.VERDANT),
		2.0, "Glut ist stark gegen Flora")
	_approx(MonsterDatabase.type_multiplier(Elements.Kind.EMBER, Elements.Kind.TIDE),
		0.5, "Glut ist schwach gegen Flut")
	_approx(MonsterDatabase.type_multiplier(Elements.Kind.SPARK, Elements.Kind.STONE),
		0.0, "Fels ist immun gegen Blitz")
	_approx(MonsterDatabase.type_multiplier(Elements.Kind.NEUTRAL, Elements.Kind.UMBRA),
		0.0, "Umbra ist immun gegen Neutral")
	# Zwei Typen multiplizieren sich: Flut/Frost gegen Glut = 2.0 * 0.5
	var dual: Array[int] = [int(Elements.Kind.TIDE), int(Elements.Kind.FROST)]
	_approx(MonsterDatabase.type_multiplier_against(Elements.Kind.EMBER, dual), 1.0,
		"Glut gegen Flut/Frost = 2.0 * 0.5")


# ---------------------------------------------------------------------------
# Werte & Fortschritt
# ---------------------------------------------------------------------------

func test_stat_math() -> void:
	_check(Stats.max_hp(50, 50, 0) > Stats.max_hp(50, 5, 0), "KP wachsen mit Level")
	_check(Stats.other_stat(80, 20, 0) > Stats.other_stat(40, 20, 0),
		"höherer Basiswert = höherer Wert")
	_check(Stats.max_hp(50, 10, 15) > Stats.max_hp(50, 10, 0), "Talentwerte zählen")
	_approx(Stats.stage_multiplier(0), 1.0, "Stufe 0 = 1.0x")
	_approx(Stats.stage_multiplier(1), 1.5, "Stufe +1 = 1.5x")
	_approx(Stats.stage_multiplier(2), 2.0, "Stufe +2 = 2.0x")
	_approx(Stats.stage_multiplier(-1), 2.0 / 3.0, "Stufe -1 = 0.66x")
	_approx(Stats.stage_multiplier(99), Stats.stage_multiplier(6), "Stufen sind begrenzt")


func test_experience() -> void:
	_eq(Stats.exp_for_level(1), 0, "Level 1 kostet keine EP")
	_check(Stats.exp_for_level(10) < Stats.exp_for_level(20), "EP-Kurve steigt")
	_check(Stats.exp_to_next(20) > Stats.exp_to_next(5), "höhere Level kosten mehr")

	var mon: MonsterInstance = _make("cindercub", 5)
	_eq(mon.level, 5, "Startlevel")
	_eq(mon.current_hp, mon.max_hp(), "startet mit vollen KP")
	_check(mon.moves.size() >= 1 and mon.moves.size() <= MonsterDatabase.max_moves(),
		"1..4 Attacken (%d)" % mon.moves.size())

	var hp_before: int = mon.max_hp()
	var events: Array[Dictionary] = mon.gain_experience(Stats.exp_to_next(5) + 1)
	_check(not events.is_empty(), "EP lösen einen Levelaufstieg aus")
	_eq(mon.level, 6, "Level 6 erreicht")
	_check(mon.max_hp() > hp_before, "max. KP steigen beim Aufstieg")
	_eq(mon.current_hp, mon.max_hp(), "Levelaufstieg heilt die neuen KP mit")

	# Sehr viele EP dürfen nicht über das Maximallevel hinausschießen.
	mon.gain_experience(99999999)
	_check(mon.level <= MonsterDatabase.max_level(), "Maximallevel wird beachtet")


func test_evolution() -> void:
	var mon: MonsterInstance = _make("cindercub", 15)
	_check(mon.try_evolve() == null, "keine Entwicklung vor Level 16")
	mon.gain_experience(Stats.exp_to_next(15) + 1)
	var evolved: MonsterSpecies = mon.try_evolve()
	_check(evolved != null, "Entwicklung auf Level 16")
	if evolved != null:
		_eq(evolved.id, "pyrelynx", "entwickelt sich zu pyrelynx")
		_eq(mon.species_id, "pyrelynx", "Instanz zeigt auf die neue Art")
		_check(mon.current_hp > 0 and mon.current_hp <= mon.max_hp(),
			"KP nach der Entwicklung plausibel")


# ---------------------------------------------------------------------------
# Team & Inventar
# ---------------------------------------------------------------------------

func test_party_limits() -> void:
	GameState.new_game(4242)
	var start: int = GameState.party_size()
	_check(start >= 1, "Startteam ist nicht leer")
	for i in 10:
		GameState.add_to_party(_make("pebbling", 4))
	_eq(GameState.party_size(), 6, "Team ist auf 6 begrenzt")
	_check(GameState.storage.size() > 0, "Überzählige landen in der Box")

	GameState.party[0].current_hp = 0
	_check(GameState.has_healthy_monster(), "restliches Team ist noch kampffähig")
	_eq(GameState.first_healthy_index(), 1, "erstes gesundes Monster ist Index 1")
	GameState.heal_party()
	_eq(GameState.first_healthy_index(), 0, "nach der Heilung wieder Index 0")

	while GameState.party_size() > 1:
		GameState.remove_from_party(GameState.party_size() - 1)
	_check(GameState.remove_from_party(0) == null, "das letzte Monster bleibt im Team")


func test_inventory() -> void:
	GameState.new_game(4242)
	GameState.inventory.clear()
	GameState.add_item("potion", 3)
	_eq(GameState.item_count("potion"), 3, "3 Heiltränke")
	_check(GameState.remove_item("potion", 2), "2 verbraucht")
	_eq(GameState.item_count("potion"), 1, "1 übrig")
	_check(not GameState.remove_item("potion", 5), "mehr als vorhanden geht nicht")
	_check(GameState.remove_item("potion", 1), "letzten verbraucht")
	_check(not GameState.has_item("potion"), "Eintrag ist weg")
	GameState.add_item("gibt_es_nicht", 1)
	_eq(GameState.item_count("gibt_es_nicht"), 0, "unbekannte Items werden ignoriert")

	GameState.add_item("capture_orb", 2)
	var battle_items: Array[ItemDefinition] = GameState.battle_items()
	_check(battle_items.size() >= 1, "Fangkugel ist im Kampf benutzbar")


# ---------------------------------------------------------------------------
# Speicherstände
# ---------------------------------------------------------------------------

func test_save_json() -> void:
	SaveSystem.format = SaveSystem.Format.JSON
	_save_roundtrip(9, "JSON")


func test_save_tres() -> void:
	SaveSystem.format = SaveSystem.Format.TRES
	_save_roundtrip(8, ".tres")
	SaveSystem.format = SaveSystem.Format.JSON


func _save_roundtrip(slot: int, label: String) -> void:
	GameState.new_game(777)
	GameState.add_to_party(_make("voltnip", 9))
	GameState.add_item("super_potion", 4)
	GameState.add_money(555)
	GameState.set_flag("test_flag", "hallo")
	GameState.remember_player_transform("res://scenes/overworld/Overworld.tscn",
		Vector3(3.5, 0.2, -7.25), 1.25)
	GameState.party[0].current_hp = maxi(1, GameState.party[0].max_hp() / 2)

	var expected_party: int = GameState.party_size()
	var expected_money: int = GameState.money
	var expected_hp: int = GameState.party[0].current_hp
	var expected_species: String = GameState.party[0].species_id

	_check(SaveSystem.save_game(slot), "%s: Speichern klappt" % label)
	_check(SaveSystem.has_save(slot), "%s: Slot ist belegt" % label)

	GameState.new_game(1)
	GameState.money = 0
	_check(SaveSystem.load_game(slot), "%s: Laden klappt" % label)
	_eq(GameState.party_size(), expected_party, "%s: Teamgröße" % label)
	_eq(GameState.money, expected_money, "%s: Geld" % label)
	_eq(GameState.party[0].current_hp, expected_hp, "%s: KP des Anführers" % label)
	_eq(GameState.party[0].species_id, expected_species, "%s: Art des Anführers" % label)
	_eq(String(GameState.get_flag("test_flag", "")), "hallo", "%s: Flags" % label)
	_approx(GameState.player_position.x, 3.5, "%s: Position X" % label)
	_approx(GameState.player_yaw, 1.25, "%s: Blickrichtung" % label)
	_check(GameState.party[0].moves.size() > 0, "%s: Attacken überlebt" % label)

	var peek: Dictionary = SaveSystem.peek(slot)
	_check(not peek.is_empty(), "%s: peek() liefert Infos" % label)
	SaveSystem.delete_save(slot)
	_check(not SaveSystem.has_save(slot), "%s: Löschen klappt" % label)


# ---------------------------------------------------------------------------
# Kampf
# ---------------------------------------------------------------------------

func test_damage_formula() -> void:
	var attacker: BattleCombatant = _combatant("cindercub", 20, BattleManager.Side.PLAYER)
	var defender: BattleCombatant = _combatant("sproutle", 20, BattleManager.Side.ENEMY)
	var fire: MoveDefinition = MonsterDatabase.get_move("ember_spit")
	var neutral: MoveDefinition = MonsterDatabase.get_move("tackle")

	var rng := RandomNumberGenerator.new()
	rng.seed = 555
	var roll_a: Dictionary = DamageCalculator.compute(attacker, defender, fire, rng)
	rng.seed = 555
	var roll_b: Dictionary = DamageCalculator.compute(attacker, defender, fire, rng)
	_eq(int(roll_a["damage"]), int(roll_b["damage"]), "gleicher Seed = gleicher Schaden")
	_check(int(roll_a["damage"]) > 0, "Schaden ist positiv")
	_approx(float(roll_a["effectiveness"]), 2.0, "Glut gegen Flora ist sehr effektiv")

	# STAB + Typvorteil sollten deutlich mehr Schaden machen als eine
	# neutrale Attacke mit ähnlicher Power.
	var fire_expected: float = DamageCalculator.expected_damage(attacker, defender, fire)
	var neutral_expected: float = DamageCalculator.expected_damage(
		attacker, defender, neutral)
	_check(fire_expected > neutral_expected,
		"Glutspucke (%.1f) > Rempler (%.1f)" % [fire_expected, neutral_expected])

	# Immunität: Neutral gegen Umbra.
	var umbra: BattleCombatant = _combatant("shadepup", 20, BattleManager.Side.ENEMY)
	_approx(DamageCalculator.expected_damage(attacker, umbra, neutral), 0.0,
		"Umbra ist immun gegen Neutral")

	# Verteidigungs-Buff senkt den Schaden.
	var before: float = DamageCalculator.expected_damage(attacker, defender, neutral)
	defender.change_stage(Stats.Stat.DEF, 2)
	var after: float = DamageCalculator.expected_damage(attacker, defender, neutral)
	_check(after < before, "Verteidigung +2 senkt den Schaden (%.1f -> %.1f)"
		% [before, after])


func test_status_effects() -> void:
	var burned: BattleCombatant = _combatant("cindercub", 20, BattleManager.Side.PLAYER)
	var clean_atk: int = burned.effective_stat(Stats.Stat.ATK)
	burned.monster.status = StatusAilments.Status.BURN
	_check(burned.effective_stat(Stats.Stat.ATK) < clean_atk,
		"Verbrennung senkt den Angriff")

	var paralyzed: BattleCombatant = _combatant("voltnip", 20, BattleManager.Side.PLAYER)
	var clean_spe: int = paralyzed.effective_speed()
	paralyzed.monster.status = StatusAilments.Status.PARALYZE
	_check(paralyzed.effective_speed() < clean_spe, "Paralyse senkt die Initiative")

	_approx(StatusAilments.catch_bonus(StatusAilments.Status.SLEEP), 2.0,
		"Schlaf verdoppelt die Fangchance")
	_approx(StatusAilments.catch_bonus(StatusAilments.Status.NONE), 1.0,
		"ohne Status kein Fangbonus")

	# Gift zieht am Rundenende KP ab.
	var manager: BattleManager = _fight_manager("pebbling", "mirefang", 20, 31337)
	manager.player_active().monster.status = StatusAilments.Status.POISON
	# Gegner tief schlafen legen -> der einzige Schaden am Spieler ist das Gift.
	manager.enemy_active().monster.status = StatusAilments.Status.SLEEP
	manager.enemy_active().monster.sleep_turns = 5
	var hp_before: int = manager.player_active().hp()
	manager.submit_player_action(BattleAction.attack(0))
	_check(manager.player_active().hp() < hp_before, "Gift verursacht Schaden")
	manager.free()


func test_turn_order() -> void:
	# gustwing kennt quick_gust (Priorität +1) und ist schnell; pebbling ist
	# langsam. Ein Prioritätsangriff muss immer zuerst kommen.
	var manager: BattleManager = _fight_manager("pebbling", "gustwing", 20, 4711)
	var slow: BattleCombatant = manager.player_active()
	var fast: BattleCombatant = manager.enemy_active()
	_check(fast.effective_speed() > slow.effective_speed(),
		"gustwing ist schneller als pebbling")
	var order: Array = manager._order_actions(
		BattleAction.attack(0), BattleAction.attack(0))
	_check(order[0]["actor"] == fast, "der schnellere handelt zuerst")

	var quick_index: int = _find_move(slow, "quick_gust")
	if quick_index < 0:
		# pebbling kennt quick_gust nicht -> Attacke zum Testen einsetzen.
		slow.monster.moves[0] = MoveSlot.create(MonsterDatabase.get_move("quick_gust"))
		quick_index = 0
	var priority_order: Array = manager._order_actions(
		BattleAction.attack(quick_index), BattleAction.attack(0))
	_check(priority_order[0]["actor"] == slow,
		"Priorität schlägt Initiative")
	manager.free()


func test_battle_completes() -> void:
	var manager: BattleManager = _fight_manager("cindercub", "sproutle", 12, 8080)
	var result: int = _play_out(manager)
	_check(result == BattleManager.Result.PLAYER_WON
		or result == BattleManager.Result.PLAYER_LOST,
		"Kampf endet mit Sieg oder Niederlage (Ergebnis %d)" % result)
	var summary: Dictionary = manager.summary()
	_check(int(summary["turns"]) > 0, "Runden wurden gezählt")
	_check((summary["log"] as Array).size() > 4, "Kampflog ist gefüllt")
	_check(int(summary["player_survivors"]) + int(summary["enemy_survivors"]) >= 1,
		"mindestens ein Monster steht noch")
	manager.free()


func test_battle_determinism() -> void:
	var first: BattleManager = _fight_manager("voltnip", "dripling", 14, 2024)
	_play_out(first)
	var log_a: Array = first.summary()["log"] as Array
	first.free()

	var second: BattleManager = _fight_manager("voltnip", "dripling", 14, 2024)
	_play_out(second)
	var log_b: Array = second.summary()["log"] as Array
	second.free()

	_eq(log_a.size(), log_b.size(), "gleiche Anzahl Log-Zeilen")
	_check(log_a == log_b, "gleicher Seed => identischer Kampfverlauf")

	var third: BattleManager = _fight_manager("voltnip", "dripling", 14, 999)
	_play_out(third)
	var log_c: Array = third.summary()["log"] as Array
	third.free()
	_check(log_a != log_c, "anderer Seed => anderer Verlauf")


func test_flee_and_capture() -> void:
	GameState.new_game(31)
	GameState.inventory.clear()
	GameState.add_item("capture_orb", 5)

	# Trainerkampf: keine Flucht, kein Fangen.
	var trainer_ctx: BattleContext = BattleContext.trainer(
		"Testtrainer", [_make("pebbling", 5)], 100, 12)
	trainer_ctx.player_party = BattleContext.party_from([_make("cindercub", 30)])
	var trainer_manager := BattleManager.new()
	trainer_manager.start(trainer_ctx)
	_check(not trainer_manager.can_flee(), "vor Trainern kann man nicht fliehen")
	_check(not trainer_manager.can_catch(), "Trainermonster kann man nicht fangen")
	trainer_manager.submit_player_action(BattleAction.flee())
	_check(trainer_manager.result != BattleManager.Result.FLED,
		"Fluchtversuch bleibt erfolglos")
	trainer_manager.free()

	# Wilder Kampf: Fangchance liegt im konfigurierten Rahmen und ein
	# geschwächtes, schlafendes Ziel ist leichter zu fangen.
	var wild_ctx: BattleContext = BattleContext.wild(_make("pebbling", 5), 77)
	wild_ctx.player_party = BattleContext.party_from([_make("cindercub", 30)])
	var manager := BattleManager.new()
	manager.start(wild_ctx)
	_check(manager.can_flee(), "vor wilden Monstern kann man fliehen")
	_check(manager.can_catch(), "wilde Monster kann man fangen")

	var orb: ItemDefinition = MonsterDatabase.get_item("capture_orb")
	var target: BattleCombatant = manager.enemy_active()
	var full_hp_chance: float = manager.capture_chance(target, orb)
	target.monster.current_hp = 1
	target.monster.status = StatusAilments.Status.SLEEP
	var weak_chance: float = manager.capture_chance(target, orb)
	_check(weak_chance > full_hp_chance,
		"geschwächt+schlafend fängt sich leichter (%.2f > %.2f)"
			% [weak_chance, full_hp_chance])
	_check(weak_chance <= MonsterDatabase.cfg_float("capture/max_chance", 0.95) + 0.001,
		"Fangchance bleibt unter dem Maximum")

	# Mit der besten Kugel und 1 KP muss der Fang irgendwann klappen.
	var party_before: int = GameState.party_size()
	var caught: bool = false
	for attempt in 40:
		if manager.is_over():
			caught = manager.result == BattleManager.Result.CAUGHT
			break
		GameState.add_item("capture_orb", 1)
		manager.submit_player_action(BattleAction.use_item("capture_orb", -1))
	_check(caught, "Fangversuche führen zum Erfolg")
	if caught:
		_eq(GameState.party_size(), party_before + 1, "gefangenes Monster im Team")
	manager.free()


func test_encounter_table() -> void:
	var table: EncounterTable = MonsterDatabase.get_encounter_table("meadow")
	_check(table != null, "Zone 'meadow' existiert")
	if table == null:
		return
	_check(table.total_weight() > 0, "Gewichtssumme ist positiv")
	var rng := RandomNumberGenerator.new()
	rng.seed = 12345
	var seen: Dictionary = {}
	var allowed: Dictionary = {}
	for entry in table.entries:
		allowed[entry.species_id] = true
	for i in 400:
		var monster: MonsterInstance = table.roll_monster(rng)
		_check(monster != null, "Wurf liefert ein Monster")
		if monster == null:
			return
		seen[monster.species_id] = true
		_check(allowed.has(monster.species_id),
			"'%s' steht in der Tabelle" % monster.species_id)
		var lo: int = 100
		var hi: int = 0
		for entry in table.entries:
			if entry.species_id == monster.species_id:
				lo = mini(entry.min_level, entry.max_level)
				hi = maxi(entry.min_level, entry.max_level)
		_check(monster.level >= lo and monster.level <= hi,
			"Level %d liegt in %d..%d" % [monster.level, lo, hi])
	_eq(seen.size(), allowed.size(), "alle Einträge kommen vor")

	# Reproduzierbarkeit: gleicher Seed => gleiche Folge.
	var rng_a := RandomNumberGenerator.new()
	rng_a.seed = 4242
	var rng_b := RandomNumberGenerator.new()
	rng_b.seed = 4242
	for i in 20:
		_eq(table.roll_monster(rng_a).species_id, table.roll_monster(rng_b).species_id,
			"gleiche Begegnungsfolge bei gleichem Seed")


# ---------------------------------------------------------------------------
# Hilfen
# ---------------------------------------------------------------------------

func _make(species_id: String, level: int) -> MonsterInstance:
	var rng := RandomNumberGenerator.new()
	rng.seed = 1000 + level
	return MonsterInstance.create(species_id, level, rng)


func _combatant(species_id: String, level: int, side: int) -> BattleCombatant:
	return BattleCombatant.create(_make(species_id, level), side, 0)


## Baut einen startbereiten Kampf (Trainer-Modus, damit nichts geflohen wird).
func _fight_manager(mine: String, theirs: String, level: int,
		seed_value: int) -> BattleManager:
	var ctx := BattleContext.new()
	ctx.is_wild = false
	ctx.allow_flee = false
	ctx.allow_catch = false
	ctx.battle_seed = seed_value
	ctx.opponent_name = "Testgegner"
	ctx.player_party = BattleContext.party_from([_make(mine, level)])
	ctx.enemy_party = BattleContext.party_from([_make(theirs, level)])
	var manager := BattleManager.new()
	manager.start(ctx)
	return manager


## Spielt einen Kampf mit der KI auf beiden Seiten zu Ende.
func _play_out(manager: BattleManager) -> int:
	var guard: int = 0
	while not manager.is_over() and guard < 1000:
		guard += 1
		if manager.phase == BattleManager.Phase.AWAIT_FORCED_SWITCH:
			var did_switch: bool = false
			for i in manager.player_team.size():
				if manager.player_team[i].is_alive():
					manager.submit_forced_switch(i)
					did_switch = true
					break
			if not did_switch:
				break
			continue
		if manager.phase != BattleManager.Phase.AWAIT_PLAYER:
			break
		manager.submit_player_action(BattleAI.choose_action(
			manager.player_active(), manager.enemy_active(), manager.rng))
	_check(guard < 1000, "Kampf läuft nicht endlos")
	return int(manager.result)


func _find_move(combatant: BattleCombatant, move_id: String) -> int:
	for i in combatant.monster.moves.size():
		if combatant.monster.moves[i].move_id == move_id:
			return i
	return -1


# ---------------------------------------------------------------------------
# Mini-Framework
# ---------------------------------------------------------------------------

func _run(test_name: String, test_fn: Callable) -> void:
	_current = test_name
	var before: int = _failures
	test_fn.call()
	var status: String = "ok  " if _failures == before else "FAIL"
	print("  [%s] %s" % [status, test_name])


func _check(condition: bool, description: String) -> void:
	_checks += 1
	if condition:
		return
	_failures += 1
	push_error("FAIL [%s] %s" % [_current, description])
	print("      -> FEHLER: %s" % description)


func _eq(actual: Variant, expected: Variant, description: String) -> void:
	_check(actual == expected, "%s (war %s, erwartet %s)" % [
		description, str(actual), str(expected)])


func _approx(actual: float, expected: float, description: String) -> void:
	_check(absf(actual - expected) < 0.001, "%s (war %.4f, erwartet %.4f)" % [
		description, actual, expected])
