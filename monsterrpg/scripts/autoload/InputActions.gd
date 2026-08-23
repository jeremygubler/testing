extends Node

## Autoload "InputActions" -- legt fehlende Eingabe-Aktionen zur Laufzeit an.
##
## Die Aktionen stehen zwar in `project.godot` (dort kann man sie im Editor
## bequem umbelegen), aber dieses Netz darunter garantiert, dass Skripte auch
## dann laufen, wenn die Input-Map mal fehlt -- z.B. in headless-Tests oder
## nach einem Merge-Konflikt in project.godot.
##
## Belegung:
## [codeblock]
## WASD / Pfeiltasten  Laufen              Linker Stick
## Maus (rechte Taste) Kamera drehen       Rechter Stick
## Mausrad             Zoom
## Leertaste           Springen (frei)     A
## E                   Interagieren        A
## Esc                 Menü / Maus frei    Start
## Shift               Rennen              B (halten)
## [/codeblock]

## action_name -> { "keys": [physical keycodes], "buttons": [...],
##                  "axes": [[axis, value], ...] }
const ACTIONS: Dictionary = {
	"move_forward": {"keys": [KEY_W, KEY_UP], "axes": [[JOY_AXIS_LEFT_Y, -1.0]]},
	"move_back": {"keys": [KEY_S, KEY_DOWN], "axes": [[JOY_AXIS_LEFT_Y, 1.0]]},
	"move_left": {"keys": [KEY_A, KEY_LEFT], "axes": [[JOY_AXIS_LEFT_X, -1.0]]},
	"move_right": {"keys": [KEY_D, KEY_RIGHT], "axes": [[JOY_AXIS_LEFT_X, 1.0]]},
	"look_up": {"keys": [], "axes": [[JOY_AXIS_RIGHT_Y, -1.0]]},
	"look_down": {"keys": [], "axes": [[JOY_AXIS_RIGHT_Y, 1.0]]},
	"look_left": {"keys": [], "axes": [[JOY_AXIS_RIGHT_X, -1.0]]},
	"look_right": {"keys": [], "axes": [[JOY_AXIS_RIGHT_X, 1.0]]},
	"jump": {"keys": [KEY_SPACE], "buttons": [JOY_BUTTON_A]},
	"sprint": {"keys": [KEY_SHIFT], "buttons": [JOY_BUTTON_B]},
	"interact": {"keys": [KEY_E], "buttons": [JOY_BUTTON_A]},
	"toggle_mouse": {"keys": [KEY_ESCAPE], "buttons": [JOY_BUTTON_START]},
	"quick_save": {"keys": [KEY_F5], "buttons": []},
	"quick_load": {"keys": [KEY_F9], "buttons": []},
	"debug_battle": {"keys": [KEY_F1], "buttons": []},
}


func _enter_tree() -> void:
	ensure_actions()


## Legt alle fehlenden Aktionen an. Vorhandene bleiben unangetastet, damit
## eigene Belegungen aus dem Editor gewinnen.
func ensure_actions() -> void:
	for action_name in ACTIONS.keys():
		var name_str: String = String(action_name)
		if InputMap.has_action(name_str):
			continue
		InputMap.add_action(name_str, 0.2)
		var spec: Dictionary = ACTIONS[action_name] as Dictionary
		for key in spec.get("keys", []):
			var ev := InputEventKey.new()
			ev.physical_keycode = int(key)
			InputMap.action_add_event(name_str, ev)
		for button in spec.get("buttons", []):
			var jb := InputEventJoypadButton.new()
			jb.button_index = int(button)
			InputMap.action_add_event(name_str, jb)
		for axis_spec in spec.get("axes", []):
			var pair: Array = axis_spec as Array
			var jm := InputEventJoypadMotion.new()
			jm.axis = int(pair[0])
			jm.axis_value = float(pair[1])
			InputMap.action_add_event(name_str, jm)
