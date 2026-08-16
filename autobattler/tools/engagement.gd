extends SceneTree

## Combat engagement harness entry point.
##
## Run:  godot --headless --path . -s res://tools/engagement.gd
##
## As a `-s` main loop this is compiled before autoloads register, so it only
## loads engagement_impl.gd at runtime (where GameDatabase is available).

func _initialize() -> void:
	var impl = load("res://tools/engagement_impl.gd").new()
	impl.run()
	quit(0)
