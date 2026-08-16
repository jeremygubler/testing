class_name IInputService
extends RefCounted

## Platform-agnostic input abstraction.
##
## Desktop maps mouse/keyboard; a Switch build maps Joy-Con / Pro Controller and
## touch. Game code queries semantic actions ("confirm", "cancel", a board-cursor
## hex) instead of raw device events, so control schemes swap without touching UI
## logic. Presentation feeds raw events in; the rest of the game reads intent out.

enum Action {
	CONFIRM,      ## A / left-click / tap
	CANCEL,       ## B / right-click / back
	REROLL,       ## shop reroll shortcut
	BUY_XP,       ## buy XP shortcut
	SELL,         ## sell held unit
	NEXT,         ## ready / continue
}

signal action_pressed(action: Action)
## Emitted when the player points at a board hex (mouse hover, stick cursor, tap).
signal hex_pointed(col: int, row: int)
## Emitted when the player selects a board hex (click/tap/confirm on a hex).
signal hex_selected(col: int, row: int)


## True while the semantic action is held this frame.
func is_action_held(action: Action) -> bool:
	push_error("IInputService.is_action_held() not implemented")
	return false


## The board hex the cursor currently points at, or Vector2i(-1,-1) if none.
func get_pointed_hex() -> Vector2i:
	push_error("IInputService.get_pointed_hex() not implemented")
	return Vector2i(-1, -1)
