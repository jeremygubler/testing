class_name ItemDefinition
extends Resource

## Ein Gegenstand (`resources/items/*.tres`).
##
## Wie Attacken sind Items reine Daten. [BattleManager] und das Inventar in
## [GameState] kennen nur die Wirkungs-*Kategorie*, nie einzelne Item-IDs.

enum Kind {
	HEAL_HP,      ## heilt KP (absolut über `amount`, oder anteilig über `ratio`)
	CURE_STATUS,  ## entfernt ein Statusproblem
	REVIVE,       ## belebt ein besiegtes Monster wieder
	CAPTURE,      ## Fangversuch (nur bei wilden Monstern)
}

@export var id: String = ""
@export var display_name: String = ""
@export_multiline var description: String = ""
@export var kind: Kind = Kind.HEAL_HP

@export_group("Wirkung")
## Absolute KP-Heilung. 0 => `ratio` benutzen.
@export_range(0, 999, 1) var amount: int = 20
## Anteilige Wirkung der max. KP (0.5 = 50 %). Greift bei HEAL_HP und REVIVE.
@export_range(0.0, 1.0, 0.05) var ratio: float = 0.0
## Fangbonus bei kind == CAPTURE (höher = besser).
@export_range(0.5, 8.0, 0.1) var catch_multiplier: float = 1.0

@export_group("Verwendung")
@export var usable_in_battle: bool = true
@export var usable_in_overworld: bool = true
@export_range(0, 99999, 1) var price: int = 200


## Zielt das Item auf ein *besiegtes* Monster? (Belebern ja, Heilen nein.)
func targets_fainted() -> bool:
	return kind == Kind.REVIVE


## KP-Heilung für ein konkretes Monster (löst `ratio` gegen dessen max. KP auf).
func heal_amount_for(monster: MonsterInstance) -> int:
	if ratio > 0.0:
		return maxi(1, int(round(ratio * float(monster.max_hp()))))
	return amount
