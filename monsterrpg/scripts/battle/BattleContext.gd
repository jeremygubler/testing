class_name BattleContext
extends Resource

## Alles, was ein Kampf zum Starten braucht -- der "Übergabezettel" zwischen
## Overworld und Battle-Szene.
##
## Warum eine Resource: so lässt sich ein Testkampf direkt im Inspector von
## `Battle.tscn` konfigurieren, und derselbe Typ wird zur Laufzeit von
## [EncounterZone] gebaut. [BattleManager] kennt nur diesen Typ -- er weiß
## nicht, ob der Kampf aus der Overworld, aus einem Test oder aus einem
## Skript kommt.

## Wilde Monster kann man fangen, Trainer-Monster nicht.
@export var is_wild: bool = true
@export var allow_flee: bool = true
@export var allow_catch: bool = true
## Name des Gegners für Log-Ausgaben ("Ein wildes ..." wenn leer).
@export var opponent_name: String = ""
## Preisgeld bei Sieg.
@export var money_reward: int = 0
## Seed des Kampf-RNG. 0 = zufällig ziehen (siehe [method resolve_seed]).
@export var battle_seed: int = 0
## Szene, in die nach dem Kampf zurückgekehrt wird.
@export var return_scene_path: String = "res://scenes/overworld/Overworld.tscn"
## Schwierigkeit der Gegner-KI.
@export var ai_level: BattleAI.Level = BattleAI.Level.GREEDY

## Gegnerteam. Wird zur Laufzeit gefüllt (nicht im Editor gesetzt).
var enemy_party: Array[MonsterInstance] = []
## Optionales Spielerteam. Leer = Team aus [GameState] benutzen.
var player_party: Array[MonsterInstance] = []


## Wilder Einzelkampf.
static func wild(monster: MonsterInstance, seed_value: int = 0) -> BattleContext:
	var ctx := BattleContext.new()
	ctx.is_wild = true
	ctx.allow_flee = true
	ctx.allow_catch = true
	ctx.battle_seed = seed_value
	ctx.enemy_party = party_from([monster])
	return ctx


## Trainerkampf: kein Fangen, keine Flucht, Preisgeld.
static func trainer(name_: String, party: Array,
		reward: int = 0, seed_value: int = 0) -> BattleContext:
	var ctx := BattleContext.new()
	ctx.is_wild = false
	ctx.allow_flee = false
	ctx.allow_catch = false
	ctx.opponent_name = name_
	ctx.money_reward = reward
	ctx.battle_seed = seed_value
	ctx.enemy_party = party_from(party)
	return ctx


## Baut aus einer beliebigen Liste ein typisiertes Team. Nötig, weil GDScript
## ein untypisiertes Array-Literal nicht automatisch in Array[MonsterInstance]
## umwandelt -- über diesen Helfer bleibt der Aufrufcode kurz und typsicher.
static func party_from(monsters: Array) -> Array[MonsterInstance]:
	var out: Array[MonsterInstance] = []
	for m in monsters:
		var inst := m as MonsterInstance
		if inst != null:
			out.append(inst)
	return out


## Liefert den zu benutzenden Seed und friert ihn ein, damit ein Reload
## desselben Kampfes identisch abläuft.
func resolve_seed() -> int:
	if battle_seed == 0:
		battle_seed = randi() | 1
	return battle_seed


func enemy_label() -> String:
	if opponent_name != "":
		return opponent_name
	return "Wildes Monster" if is_wild else "Gegner"
