class_name LearnsetEntry
extends Resource

## Ein Eintrag in der Lernliste einer Art: "ab Level X kennt die Art Attacke Y".
##
## Eigene Resource (statt Dictionary), damit der Godot-Inspector eine echte
## Liste mit Typprüfung zeigt. Wird in `MonsterSpecies.learnset` als
## SubResource inline gespeichert.

## Level, ab dem die Attacke gelernt wird. 1 = Startattacke.
@export_range(1, 100, 1) var level: int = 1
@export var move: MoveDefinition = null
