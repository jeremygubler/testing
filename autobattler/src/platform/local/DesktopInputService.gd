extends IInputService

## Desktop input implementation: mouse + keyboard -> semantic actions.
## Presentation calls handle_event() with the raw event plus the board hex the
## mouse is currently over (computed by the board renderer, which owns geometry).

var _pointed: Vector2i = Vector2i(-1, -1)
var _held: Dictionary = {}  # Action -> bool


func handle_event(event: InputEvent, board_hex: Vector2i) -> void:
	if event is InputEventMouseMotion:
		if board_hex != _pointed:
			_pointed = board_hex
			hex_pointed.emit(_pointed.x, _pointed.y)
		return

	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_LEFT:
			action_pressed.emit(Action.CONFIRM)
			if board_hex.x >= 0:
				hex_selected.emit(board_hex.x, board_hex.y)
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			action_pressed.emit(Action.CANCEL)
		return

	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_D:
				action_pressed.emit(Action.REROLL)
			KEY_F:
				action_pressed.emit(Action.BUY_XP)
			KEY_E:
				action_pressed.emit(Action.SELL)
			KEY_SPACE, KEY_ENTER:
				action_pressed.emit(Action.NEXT)


func is_action_held(action: Action) -> bool:
	return _held.get(action, false)


func get_pointed_hex() -> Vector2i:
	return _pointed
