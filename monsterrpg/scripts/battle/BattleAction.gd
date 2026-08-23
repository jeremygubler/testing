class_name BattleAction
extends RefCounted

## Die Absicht *eines* Kämpfers für *eine* Runde -- ein reines Wertobjekt.
##
## Die UI baut eine BattleAction und gibt sie an
## [method BattleManager.submit_player_action]; die KI baut dieselbe Struktur.
## Dadurch ist der Kampf komplett ohne UI spielbar (siehe `tools/battle_sim.gd`).

enum Kind {
	ATTACK, ## Attacke aus dem Moveset benutzen
	SWITCH, ## aktives Monster wechseln
	ITEM,   ## Gegenstand benutzen (inkl. Fangversuch)
	FLEE,   ## Fluchtversuch (nur gegen wilde Monster)
}

var kind: Kind = Kind.ATTACK
## Index in [member MonsterInstance.moves] (bei ATTACK).
var move_index: int = 0
## Ziel-Index im eigenen Team (bei SWITCH und ITEM).
var target_index: int = 0
## Item-ID (bei ITEM).
var item_id: String = ""


static func attack(move_index_: int) -> BattleAction:
	var a := BattleAction.new()
	a.kind = Kind.ATTACK
	a.move_index = move_index_
	return a


static func switch_to(party_index: int) -> BattleAction:
	var a := BattleAction.new()
	a.kind = Kind.SWITCH
	a.target_index = party_index
	return a


## [param party_index] = -1 bedeutet "kein Team-Ziel" (z.B. Fangversuch).
static func use_item(item_id_: String, party_index: int = -1) -> BattleAction:
	var a := BattleAction.new()
	a.kind = Kind.ITEM
	a.item_id = item_id_
	a.target_index = party_index
	return a


static func flee() -> BattleAction:
	var a := BattleAction.new()
	a.kind = Kind.FLEE
	return a


func _to_string() -> String:
	match kind:
		Kind.ATTACK:
			return "ATTACK(%d)" % move_index
		Kind.SWITCH:
			return "SWITCH(%d)" % target_index
		Kind.ITEM:
			return "ITEM(%s -> %d)" % [item_id, target_index]
		_:
			return "FLEE"
