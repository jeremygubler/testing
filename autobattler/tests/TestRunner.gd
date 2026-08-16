extends SceneTree

## Headless test entry point.
##
## Run:  godot --headless --path . -s res://tests/TestRunner.gd
##
## This script is the `-s` main loop and is compiled BEFORE autoload singletons
## are registered, so it must not reference GameDatabase/PlatformServices. It only
## loads TestSuite.gd at runtime (where autoloads are available) and runs it.

func _initialize() -> void:
	var suite = load("res://tests/TestSuite.gd").new()
	var failed: int = suite.run()
	quit(1 if failed > 0 else 0)
