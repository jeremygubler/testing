extends SceneTree

## Lade-Check für alle Szenen und Inhalts-Resources.
##
##     godot --headless --path . -s res://tools/scene_check.gd
##
## Prüft, dass jede .tscn instanziierbar ist (fehlende ext_resources, kaputte
## Node-Typen) und dass jede .tres wirklich als der erwartete Typ ankommt.
## Entry-Script-Muster: die Arbeit macht scene_check_impl.gd, das erst *nach*
## der Autoload-Registrierung geladen wird.

func _initialize() -> void:
	var impl_script: GDScript = load("res://tools/scene_check_impl.gd")
	var impl: RefCounted = impl_script.new()
	quit(int(impl.call("run", self)))
