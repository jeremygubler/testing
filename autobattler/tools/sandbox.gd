extends SceneTree

## Headless combat + cosmetics sandbox entry point.
##
## Run:  godot --headless --path . -s res://tools/sandbox.gd
##
## As a `-s` main loop this script is compiled before autoloads are registered, so
## it only loads sandbox_impl.gd at runtime (where GameDatabase / PlatformServices
## are available) and runs it.

func _initialize() -> void:
	var impl = load("res://tools/sandbox_impl.gd").new()
	impl.run()
	quit(0)
