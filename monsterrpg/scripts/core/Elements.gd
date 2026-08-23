class_name Elements
extends RefCounted

## Element-Typen des Spiels (eigene IP, keine geschützten Namen).
##
## Der Enum ist die *einzige* Quelle der Wahrheit für Typ-IDs. Die JSON-
## Typenmatrix (`data/type_chart.json`) benutzt die String-Keys aus [member KEYS],
## damit Designer die Matrix ohne Code-Änderung anpassen können.
##
## Reine Utility-Klasse: nie instanziieren, nur statisch benutzen
## ([code]Elements.label(Elements.Kind.EMBER)[/code]).

enum Kind {
	NEUTRAL, ## farblos, keine Schwächen im Angriff außer STONE/UMBRA
	EMBER,   ## Glut / Feuer
	TIDE,    ## Flut / Wasser
	VERDANT, ## Flora / Pflanze
	SPARK,   ## Blitz
	FROST,   ## Eis
	STONE,   ## Fels
	GALE,    ## Wind
	TOXIN,   ## Gift
	UMBRA,   ## Schatten
}

## String-Keys in der Reihenfolge des Enums (Index == Enum-Wert).
const KEYS: Array[String] = [
	"neutral", "ember", "tide", "verdant", "spark",
	"frost", "stone", "gale", "toxin", "umbra",
]

## Anzeigenamen (deutsch) für UI-Ausgaben.
const LABELS: Array[String] = [
	"Neutral", "Glut", "Flut", "Flora", "Blitz",
	"Frost", "Fels", "Wind", "Toxin", "Umbra",
]

## Farbe für Platzhalter-Material / UI-Badges.
const COLORS: Array[Color] = [
	Color(0.78, 0.78, 0.74), Color(0.90, 0.34, 0.18), Color(0.20, 0.52, 0.88),
	Color(0.30, 0.72, 0.32), Color(0.96, 0.82, 0.20), Color(0.60, 0.86, 0.94),
	Color(0.62, 0.52, 0.38), Color(0.68, 0.86, 0.78), Color(0.62, 0.32, 0.72),
	Color(0.32, 0.26, 0.40),
]

## Sentinel für "kein Zweittyp". Wird überall als `-1` gespeichert, damit der
## Enum selbst keinen künstlichen NONE-Eintrag braucht (der sonst in jeder
## Typenmatrix mitgeschleppt werden müsste).
const NONE: int = -1


static func count() -> int:
	return KEYS.size()


## Enum -> JSON-Key.
static func key(kind: int) -> String:
	if kind < 0 or kind >= KEYS.size():
		return ""
	return KEYS[kind]


## JSON-Key -> Enum. Unbekannte Keys ergeben [constant NONE].
static func from_key(k: String) -> int:
	var idx: int = KEYS.find(k.strip_edges().to_lower())
	return idx if idx >= 0 else NONE


static func label(kind: int) -> String:
	if kind < 0 or kind >= LABELS.size():
		return "-"
	return LABELS[kind]


static func color(kind: int) -> Color:
	if kind < 0 or kind >= COLORS.size():
		return Color(0.5, 0.5, 0.5)
	return COLORS[kind]


## Typenliste eines Monsters als lesbarer String, z.B. "Flut/Frost".
static func labels_of(types: Array[int]) -> String:
	var parts: Array[String] = []
	for t in types:
		if t != NONE:
			parts.append(label(t))
	return "/".join(parts)
