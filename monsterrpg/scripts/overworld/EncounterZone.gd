class_name EncounterZone
extends Area3D

## Zufallsbegegnungen in einem abgegrenzten Bereich.
##
## Die Zone hört auf [signal PlayerController.moved] und würfelt alle
## [member EncounterTable.distance_per_check] gelaufenen Meter einmal. Kein
## Timer, kein Polling -- wer stehen bleibt, trifft nichts.
##
## Die Zone kennt weder Kampfszene noch UI: sie baut einen [BattleContext] und
## übergibt ihn an [GameFlow]. Zum Testen kann man stattdessen einfach
## [signal encounter_triggered] abhören.
##
## Zufall kommt aus [member GameState.encounter_rng] (Seed liegt im Spielstand),
## damit dieselbe Route dieselben Begegnungen liefert.

## Ausgelöst, kurz bevor der Kampf gestartet wird.
signal encounter_triggered(monster: MonsterInstance, zone: EncounterZone)
signal player_entered(zone: EncounterZone)
signal player_exited(zone: EncounterZone)

@export_group("Zone")
## Anzeigename für HUD/Log ("Blütenwiese").
@export var zone_name: String = "Unbenannte Zone"
@export var table: EncounterTable = null
@export var enabled: bool = true
## Wenn false, wird kein Kampf gestartet -- nur das Signal gefeuert
## (praktisch, um das Begegnungssystem isoliert zu testen).
@export var start_battle_on_encounter: bool = true

@export_group("Überschreibungen")
## > 0 überschreibt [member EncounterTable.distance_per_check].
@export_range(0.0, 50.0, 0.5) var distance_per_check_override: float = 0.0
## > 0 überschreibt [member EncounterTable.encounter_chance].
@export_range(0.0, 1.0, 0.01) var chance_override: float = 0.0
## > 0 überschreibt [member EncounterTable.cooldown_seconds].
@export_range(0.0, 120.0, 0.5) var cooldown_override: float = 0.0

var _players: Array[PlayerController] = []
var _accumulated: float = 0.0
var _cooldown_left: float = 0.0


func _ready() -> void:
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)
	if table == null:
		push_warning("[EncounterZone] '%s' hat keine Begegnungstabelle." % zone_name)


func _process(delta: float) -> void:
	if _cooldown_left > 0.0:
		_cooldown_left = maxf(0.0, _cooldown_left - delta)


func _on_body_entered(body: Node3D) -> void:
	var player := body as PlayerController
	if player == null or _players.has(player):
		return
	_players.append(player)
	# Wir hören auf die Laufstrecke des Spielers statt sie selbst zu messen --
	# so zählt auch eine Rasterbewegung korrekt.
	if not player.moved.is_connected(_on_player_moved):
		player.moved.connect(_on_player_moved)
	_accumulated = 0.0
	player_entered.emit(self)


func _on_body_exited(body: Node3D) -> void:
	var player := body as PlayerController
	if player == null:
		return
	_players.erase(player)
	if player.moved.is_connected(_on_player_moved):
		player.moved.disconnect(_on_player_moved)
	player_exited.emit(self)


func _on_player_moved(distance: float) -> void:
	if not enabled or table == null or _players.is_empty():
		return
	if _cooldown_left > 0.0:
		return
	_accumulated += distance
	var step: float = distance_per_check()
	while _accumulated >= step:
		_accumulated -= step
		if GameState.encounter_rng.randf() < encounter_chance():
			_trigger()
			return


func distance_per_check() -> float:
	if distance_per_check_override > 0.0:
		return distance_per_check_override
	if table != null:
		return maxf(0.5, table.distance_per_check)
	return MonsterDatabase.cfg_float("encounters/distance_per_check", 4.0)


func encounter_chance() -> float:
	if chance_override > 0.0:
		return chance_override
	if table != null:
		return table.encounter_chance
	return MonsterDatabase.cfg_float("encounters/chance", 0.18)


func cooldown_seconds() -> float:
	if cooldown_override > 0.0:
		return cooldown_override
	if table != null:
		return table.cooldown_seconds
	return MonsterDatabase.cfg_float("encounters/cooldown_seconds", 6.0)


## Löst sofort eine Begegnung aus (Debug-Taste, Skript-Tests).
func force_encounter() -> MonsterInstance:
	return _trigger()


func _trigger() -> MonsterInstance:
	if table == null or GameState.party.is_empty():
		return null
	var monster: MonsterInstance = table.roll_monster(GameState.encounter_rng)
	if monster == null:
		push_warning("[EncounterZone] '%s': Tabelle liefert kein Monster." % zone_name)
		return null
	_cooldown_left = cooldown_seconds()
	_accumulated = 0.0
	encounter_triggered.emit(monster, self)
	if start_battle_on_encounter:
		# Eigener Kampf-Seed aus dem Welt-RNG: reproduzierbar, aber pro Kampf anders.
		var seed_value: int = GameState.encounter_rng.randi() | 1
		var ctx: BattleContext = BattleContext.wild(monster, seed_value)
		GameFlow.start_battle(ctx, _players[0] if not _players.is_empty() else null)
	return monster
