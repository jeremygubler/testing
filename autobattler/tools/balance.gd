extends SceneTree

## Headless balance harness entry point.
##
## Run:  godot --headless --path . -s res://tools/balance.gd
##
## As a `-s` main loop this is compiled before autoloads register, so it only
## loads balance_impl.gd at runtime (where GameDatabase is available) and runs it.

func _initialize() -> void:
	var impl = load("res://tools/balance_impl.gd").new()
	impl.run()
	quit(0)
