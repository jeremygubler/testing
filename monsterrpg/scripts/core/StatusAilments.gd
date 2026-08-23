class_name StatusAilments
extends RefCounted

## Dauerhafte Statusprobleme (genau eines pro Monster, wie im Genre üblich).
## Volatile Effekte (z.B. Verwirrung) gehören in [BattleCombatant], nicht hier.

enum Status {
	NONE,
	BURN,     ## Verbrennung: Schaden pro Runde + halbierter physischer Angriff
	POISON,   ## Vergiftung: Schaden pro Runde
	PARALYZE, ## Paralyse: halbierte Initiative + Chance auf Aussetzer
	SLEEP,    ## Schlaf: setzt 1-3 Runden aus
}

const KEYS: Array[String] = ["none", "burn", "poison", "paralyze", "sleep"]
const LABELS: Array[String] = ["-", "VBR", "GFT", "PAR", "SLF"]
const LONG_LABELS: Array[String] = [
	"", "verbrannt", "vergiftet", "paralysiert", "schläft",
]

## Anteil der max. KP, der pro Runde als Schaden anfällt.
const TICK_FRACTION: Dictionary = {
	Status.BURN: 1.0 / 16.0,
	Status.POISON: 1.0 / 8.0,
}


static func key(status: int) -> String:
	return KEYS[status] if status >= 0 and status < KEYS.size() else "none"


static func from_key(k: String) -> int:
	var idx: int = KEYS.find(k.strip_edges().to_lower())
	return idx if idx >= 0 else Status.NONE


static func label(status: int) -> String:
	return LABELS[status] if status >= 0 and status < LABELS.size() else "-"


static func long_label(status: int) -> String:
	return LONG_LABELS[status] if status >= 0 and status < LONG_LABELS.size() else ""


## Bonus-Multiplikator beim Fangen: angeschlagene Ziele fängt man leichter.
static func catch_bonus(status: int) -> float:
	match status:
		Status.SLEEP:
			return 2.0
		Status.PARALYZE, Status.BURN, Status.POISON:
			return 1.5
		_:
			return 1.0
