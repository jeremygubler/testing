extends SceneTree

## Headless-Kampfsimulator (Balancing-Werkzeug).
##
##     godot --headless --path . -s res://tools/battle_sim.gd
##
## Läuft ohne UI und ohne Szene: KI gegen KI, gleicher Regel-Kern wie im Spiel.
## Gibt aus:
##   1. Determinismus-Prüfung (gleicher Seed => identisches Log),
##   2. Zufallsstichprobe: Siegquote/Rundenlänge/Abbrüche,
##   3. Rundenturnier aller Arten -> Siegquote je Art (Balance-Signal).
##
## Entry-Script-Muster wegen der Autoloads (siehe CLAUDE-Hinweis in README).

func _initialize() -> void:
	var impl_script: GDScript = load("res://tools/battle_sim_impl.gd")
	var impl: RefCounted = impl_script.new()
	quit(int(impl.call("run", self)))
