class_name Stats
extends RefCounted

## Statuswerte-Definitionen + die komplette Stat-Mathematik an einem Ort.
##
## Alle Formeln hier sind bewusst *eigene* Formeln (keine Kopie eines
## kommerziellen Spiels), aber nach demselben Prinzip: Basiswert + Level +
## kleiner individueller Bonus. Wer balancen will, ändert nur diese Datei
## bzw. `data/game_config.json`.

enum Stat {
	HP,  ## Trefferpunkte
	ATK, ## physischer Angriff
	DEF, ## physische Verteidigung
	SPA, ## spezieller Angriff
	SPD, ## spezielle Verteidigung
	SPE, ## Initiative / Geschwindigkeit
}

const COUNT: int = 6

const KEYS: Array[String] = ["hp", "atk", "def", "spa", "spd", "spe"]
const LABELS: Array[String] = ["KP", "Ang", "Vet", "Sp.Ang", "Sp.Vet", "Init"]

## Maximaler individueller Bonus ("Talentwert"). 0..IV_MAX pro Stat.
const IV_MAX: int = 15

## Grenzen für Stat-Stufen im Kampf (Buffs/Debuffs).
const STAGE_MIN: int = -6
const STAGE_MAX: int = 6


static func key(stat: int) -> String:
	return KEYS[stat] if stat >= 0 and stat < KEYS.size() else ""


static func label(stat: int) -> String:
	return LABELS[stat] if stat >= 0 and stat < LABELS.size() else "?"


static func from_key(k: String) -> int:
	return KEYS.find(k.strip_edges().to_lower())


## Berechnet die maximalen KP.
## KP wachsen schneller als andere Werte, damit Kämpfe nicht zu kurz werden.
static func max_hp(base: int, level: int, iv: int) -> int:
	return int(floor(float(base) * 2.0 * float(level) / 100.0)) + level + 10 + iv


## Berechnet einen Nicht-KP-Wert (ATK/DEF/SPA/SPD/SPE).
static func other_stat(base: int, level: int, iv: int) -> int:
	return int(floor(float(base) * 2.0 * float(level) / 100.0)) + 5 + iv


## Multiplikator einer Stat-Stufe (-6..+6). +1 => 1.5x, -1 => 0.66x.
static func stage_multiplier(stage: int) -> float:
	var s: int = clampi(stage, STAGE_MIN, STAGE_MAX)
	if s >= 0:
		return (2.0 + float(s)) / 2.0
	return 2.0 / (2.0 - float(s))


## Erfahrungspunkte, die insgesamt für [param level] nötig sind.
## Kubische Kurve: Level 10 ~ 800 EP, Level 50 ~ 100k EP.
static func exp_for_level(level: int) -> int:
	if level <= 1:
		return 0
	return int(round(0.8 * pow(float(level), 3.0)))


## EP-Bedarf für den nächsten Levelaufstieg.
static func exp_to_next(level: int) -> int:
	return exp_for_level(level + 1) - exp_for_level(level)
