extends SceneTree

## Headless item balance harness entry point.
##
## Run:  godot --headless --path . -s res://tools/items.gd
##
## As a `-s` main loop this is compiled before autoloads register, so it only
## loads items_impl.gd at runtime (where GameDatabase is available) and runs it.

func _initialize() -> void:
	var impl = load("res://tools/items_impl.gd").new()
	impl.run()
	quit(0)
