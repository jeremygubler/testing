class_name MonsterSpecies
extends Resource

## Definition einer Monster-*Art* (`resources/monsters/*.tres`).
##
## Enthält nur unveränderliche Daten: Basiswerte, Typen, Lernliste, Entwicklung
## und Platzhalter-Optik. Der individuelle Zustand eines gefangenen Monsters
## (Level, KP, EP, PP) lebt in [MonsterInstance] und referenziert die Art nur
## über [member id].

@export_group("Identität")
## Stabile, technische ID (snake_case). Speicherstände referenzieren *diese* ID.
@export var id: String = ""
@export var display_name: String = ""
@export_multiline var codex_text: String = ""

@export_group("Typen")
@export var primary_type: Elements.Kind = Elements.Kind.NEUTRAL
## Zweittyp aktivieren. Getrenntes Flag, weil ein Enum kein "kein Typ" kennt.
@export var has_secondary_type: bool = false
@export var secondary_type: Elements.Kind = Elements.Kind.NEUTRAL

@export_group("Basiswerte")
@export_range(1, 255, 1) var base_hp: int = 50
@export_range(1, 255, 1) var base_atk: int = 50
@export_range(1, 255, 1) var base_def: int = 50
@export_range(1, 255, 1) var base_spa: int = 50
@export_range(1, 255, 1) var base_spd: int = 50
@export_range(1, 255, 1) var base_spe: int = 50

@export_group("Fortschritt")
## Höher = leichter zu fangen (1..255).
@export_range(1, 255, 1) var catch_rate: int = 120
## Basis für die EP-Ausbeute beim Besiegen.
@export_range(1, 400, 1) var base_exp: int = 60
@export var learnset: Array[LearnsetEntry] = []
## ID der Art, in die sich diese Art entwickelt ("" = keine Entwicklung).
@export var evolves_into: String = ""
@export_range(0, 100, 1) var evolve_level: int = 0

@export_group("Platzhalter-Optik")
## Wird vom Platzhalter-Mesh als Albedo benutzt, solange es keine Modelle gibt.
@export var placeholder_color: Color = Color(0.8, 0.8, 0.8)
## Skalierung des Platzhalter-Körpers (grobe Größenanmutung).
@export var placeholder_scale: Vector3 = Vector3.ONE


## Alle Typen der Art als Liste (1 oder 2 Einträge).
func types() -> Array[int]:
	var out: Array[int] = [int(primary_type)]
	if has_secondary_type and int(secondary_type) != int(primary_type):
		out.append(int(secondary_type))
	return out


## Basiswerte in der Reihenfolge von [enum Stats.Stat].
func base_stats() -> Array[int]:
	return [base_hp, base_atk, base_def, base_spa, base_spd, base_spe]


func base_stat(stat: int) -> int:
	return base_stats()[stat]


## Summe der Basiswerte -- grober Stärkeindikator fürs Balancing.
func base_stat_total() -> int:
	var total: int = 0
	for v in base_stats():
		total += v
	return total


## Alle Attacken, die ein Monster dieser Art auf [param level] kennen kann,
## in Lern-Reihenfolge (älteste zuerst).
func moves_up_to_level(level: int) -> Array[MoveDefinition]:
	var out: Array[MoveDefinition] = []
	var entries: Array[LearnsetEntry] = learnset.duplicate()
	entries.sort_custom(func(a: LearnsetEntry, b: LearnsetEntry) -> bool:
		return a.level < b.level)
	for e in entries:
		if e != null and e.move != null and e.level <= level:
			out.append(e.move)
	return out


## Attacken, die genau auf [param level] gelernt werden (für Levelaufstiege).
func moves_learned_at(level: int) -> Array[MoveDefinition]:
	var out: Array[MoveDefinition] = []
	for e in learnset:
		if e != null and e.move != null and e.level == level:
			out.append(e.move)
	return out


func can_evolve_at(level: int) -> bool:
	return evolves_into != "" and evolve_level > 0 and level >= evolve_level
