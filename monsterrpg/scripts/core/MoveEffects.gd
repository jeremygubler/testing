class_name MoveEffects
extends RefCounted

## Effekt-Katalog für Attacken. Eine Attacke hat *einen* Zusatzeffekt; das
## deckt fast alles ab, was ein Grundgerüst braucht, und bleibt daten-getrieben:
## neue Attacken sind ein neues .tres, kein Code.
##
## Neuen Effekt hinzufügen = Enum-Eintrag + ein `match`-Zweig in
## [method BattleManager._apply_move_effect]. Alles andere bleibt unberührt.

enum Effect {
	NONE,          ## nur Schaden
	STAT_CHANGE,   ## verändert Stat-Stufen (Ziel je nach `targets_self`)
	INFLICT_STATUS,## setzt ein Statusproblem
	DRAIN,         ## heilt einen Anteil des verursachten Schadens
	RECOIL,        ## Anwender nimmt einen Anteil des Schadens selbst
	HEAL,          ## heilt einen Anteil der max. KP des Anwenders
}

const KEYS: Array[String] = [
	"none", "stat_change", "inflict_status", "drain", "recoil", "heal",
]


static func key(effect: int) -> String:
	return KEYS[effect] if effect >= 0 and effect < KEYS.size() else "none"


static func from_key(k: String) -> int:
	var idx: int = KEYS.find(k.strip_edges().to_lower())
	return idx if idx >= 0 else Effect.NONE
