class_name CameraRig
extends Node3D

## Kamera-Drehpunkt hinter dem Spieler: Maus- und Gamepad-Steuerung, Zoom,
## Kollisionsvermeidung über den [SpringArm3D].
##
## Hängt als Kind des Spielers, dreht sich aber unabhängig von ihm (der Spieler
## rotiert nur seine Optik, siehe [PlayerController]).
##
## Steuerung: rechte Maustaste halten [i]oder[/i] Maus gefangen (Esc schaltet um),
## rechter Stick, Mausrad für den Zoom.

@export_group("Empfindlichkeit")
@export_range(0.0005, 0.02, 0.0005) var mouse_sensitivity: float = 0.004
@export_range(0.5, 8.0, 0.1) var stick_sensitivity: float = 2.6
@export var invert_y: bool = false

@export_group("Grenzen")
@export_range(-89.0, 0.0, 1.0) var min_pitch_degrees: float = -70.0
@export_range(0.0, 89.0, 1.0) var max_pitch_degrees: float = 25.0
@export_range(1.0, 30.0, 0.5) var zoom_min: float = 2.5
@export_range(1.0, 40.0, 0.5) var zoom_max: float = 12.0
@export_range(0.1, 5.0, 0.1) var zoom_step: float = 0.8
@export_range(1.0, 30.0, 0.5) var zoom_lerp: float = 10.0

@export_group("Verhalten")
## Maus beim Start einfangen (klassische 3rd-Person-Steuerung).
@export var capture_mouse_on_start: bool = false
## Höhe des Drehpunkts über dem Spielerursprung.
@export_range(0.0, 4.0, 0.05) var pivot_height: float = 1.4
@export var spring_arm_path: NodePath = ^"SpringArm3D"

var _spring_arm: SpringArm3D = null
var _target_zoom: float = 6.0
var _pitch: float = -0.35


func _ready() -> void:
	_spring_arm = get_node_or_null(spring_arm_path) as SpringArm3D
	if _spring_arm != null:
		_target_zoom = clampf(_spring_arm.spring_length, zoom_min, zoom_max)
		_pitch = _spring_arm.rotation.x
	position.y = pivot_height
	# Eigenen Körper ausschließen, sonst schiebt der SpringArm die Kamera am
	# Spieler-Collider vorbei ins Gesicht.
	var owner_body := get_parent() as CollisionObject3D
	if _spring_arm != null and owner_body != null:
		_spring_arm.add_excluded_object(owner_body.get_rid())
	if capture_mouse_on_start:
		set_mouse_captured(true)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("toggle_mouse"):
		set_mouse_captured(not is_mouse_captured())
		return

	if event is InputEventMouseMotion:
		var motion := event as InputEventMouseMotion
		# Drehen, wenn die Maus gefangen ist ODER die rechte Taste gehalten wird.
		var dragging: bool = Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT)
		if is_mouse_captured() or dragging:
			_apply_look(-motion.relative.x * mouse_sensitivity,
				-motion.relative.y * mouse_sensitivity)
		return

	if event is InputEventMouseButton and event.is_pressed():
		var button := event as InputEventMouseButton
		if button.button_index == MOUSE_BUTTON_WHEEL_UP:
			_target_zoom = clampf(_target_zoom - zoom_step, zoom_min, zoom_max)
		elif button.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_target_zoom = clampf(_target_zoom + zoom_step, zoom_min, zoom_max)


func _process(delta: float) -> void:
	# Gamepad: rechter Stick dreht kontinuierlich.
	var stick := Vector2(
		Input.get_axis("look_left", "look_right"),
		Input.get_axis("look_up", "look_down"))
	if stick.length_squared() > 0.02:
		_apply_look(-stick.x * stick_sensitivity * delta,
			-stick.y * stick_sensitivity * delta)
	if _spring_arm != null:
		_spring_arm.spring_length = lerpf(
			_spring_arm.spring_length, _target_zoom, clampf(zoom_lerp * delta, 0.0, 1.0))


func _apply_look(yaw_delta: float, pitch_delta: float) -> void:
	rotation.y = wrapf(rotation.y + yaw_delta, -PI, PI)
	_pitch = clampf(_pitch + (pitch_delta * (-1.0 if invert_y else 1.0)),
		deg_to_rad(min_pitch_degrees), deg_to_rad(max_pitch_degrees))
	if _spring_arm != null:
		_spring_arm.rotation.x = _pitch


func is_mouse_captured() -> bool:
	return Input.mouse_mode == Input.MOUSE_MODE_CAPTURED


func set_mouse_captured(captured: bool) -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if captured \
		else Input.MOUSE_MODE_VISIBLE
