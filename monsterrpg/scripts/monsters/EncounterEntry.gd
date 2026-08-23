class_name EncounterEntry
extends Resource

## Ein Eintrag einer Begegnungstabelle: welche Art, wie häufig, welches Level.

@export var species_id: String = ""
## Relatives Gewicht innerhalb der Tabelle (muss nicht auf 100 summieren).
@export_range(1, 1000, 1) var weight: int = 10
@export_range(1, 100, 1) var min_level: int = 3
@export_range(1, 100, 1) var max_level: int = 5
