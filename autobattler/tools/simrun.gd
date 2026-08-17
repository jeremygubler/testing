extends SceneTree

## Headless full-run simulator entry point.
##
## Run:  godot --headless --path . -s res://tools/simrun.gd
##
## As a `-s` main loop this is compiled before autoloads register, so it only
## loads simrun_impl.gd at runtime (where GameDatabase is available) and runs it.

func _initialize() -> void:
	var impl = load("res://tools/simrun_impl.gd").new()
	impl.run()
	quit(0)
