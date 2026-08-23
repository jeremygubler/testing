class_name EncounterTable
extends Resource

## Begegnungstabelle einer Zone (`resources/encounters/*.tres`).
##
## Wird von [EncounterZone] benutzt. Die Ziehung läuft ausschließlich über einen
## übergebenen [RandomNumberGenerator], damit ein Spielstand-Seed dieselbe
## Begegnungsfolge reproduziert (praktisch für Bug-Reports und Tests).

@export var id: String = ""
@export var display_name: String = ""
@export var entries: Array[EncounterEntry] = []

@export_group("Häufigkeit")
## Zurückgelegte Strecke (in Metern) pro Begegnungswurf.
@export_range(0.5, 50.0, 0.5) var distance_per_check: float = 4.0
## Trefferwahrscheinlichkeit pro Wurf.
@export_range(0.0, 1.0, 0.01) var encounter_chance: float = 0.18
## Mindestabstand in Sekunden zwischen zwei Begegnungen dieser Zone.
@export_range(0.0, 120.0, 0.5) var cooldown_seconds: float = 6.0


func total_weight() -> int:
	var sum: int = 0
	for e in entries:
		if e != null and e.species_id != "":
			sum += maxi(1, e.weight)
	return sum


## Zieht einen Eintrag gewichtet. Null, wenn die Tabelle leer ist.
func roll_entry(rng: RandomNumberGenerator) -> EncounterEntry:
	var total: int = total_weight()
	if total <= 0:
		return null
	var pick: int = rng.randi_range(1, total)
	for e in entries:
		if e == null or e.species_id == "":
			continue
		pick -= maxi(1, e.weight)
		if pick <= 0:
			return e
	return null


## Erzeugt ein fertiges wildes Monster aus dieser Tabelle (null bei leerer Tabelle).
func roll_monster(rng: RandomNumberGenerator) -> MonsterInstance:
	var entry: EncounterEntry = roll_entry(rng)
	if entry == null:
		return null
	var lo: int = mini(entry.min_level, entry.max_level)
	var hi: int = maxi(entry.min_level, entry.max_level)
	return MonsterInstance.create(entry.species_id, rng.randi_range(lo, hi), rng)
