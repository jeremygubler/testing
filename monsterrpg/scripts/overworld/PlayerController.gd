class_name PlayerController
extends CharacterBody3D

## Der Overworld-Spieler. Zwei Bewegungsmodi, im Inspector umschaltbar:
##
##   * [constant MovementMode.FREE] -- freie 3D-Bewegung relativ zur Kamera,
##     mit Beschleunigung, Schwerkraft und Sprung.
##   * [constant MovementMode.GRID] -- feldweise Bewegung im Raster (klassischer
##     Genre-Look). Ein Schritt ist eine feste Strecke und dauert eine feste
##     Zeit; Hindernisse werden vorher per [method PhysicsBody3D.test_move]
##     geprüft.
##
## Nur die Optik (`Body`) dreht sich in Laufrichtung -- der [CharacterBody3D]
## selbst bleibt unrotiert, damit die Kamera als Kind hängen kann, ohne
## mitzudrehen.
##
## Für das Begegnungssystem zählt der Spieler die zurückgelegte Strecke und
## meldet sie per [signal moved]; [EncounterZone] hört mit. Der Spieler kennt
## das Kampfsystem also überhaupt nicht.

enum MovementMode { FREE, GRID }

## Zurückgelegte Strecke seit dem letzten Frame (nur Bodenbewegung).
signal moved(distance: float)
## Ein abgeschlossener Rasterschritt (nur im GRID-Modus).
signal stepped(cell: Vector3i)
## "interact" wurde gedrückt -- Aufhänger für NPCs, Truhen, Türen.
signal interacted(collider: Node3D)

@export_group("Bewegung")
@export var movement_mode: MovementMode = MovementMode.FREE
## Laufgeschwindigkeit in m/s (FREE) bzw. Referenz für die Schrittdauer (GRID).
@export_range(1.0, 20.0, 0.1) var walk_speed: float = 5.0
@export_range(1.0, 3.0, 0.05) var sprint_multiplier: float = 1.7
## Wie schnell die Zielgeschwindigkeit erreicht wird (höher = knackiger).
@export_range(1.0, 40.0, 0.5) var acceleration: float = 14.0
@export_range(0.0, 20.0, 0.1) var jump_velocity: float = 5.0
@export_range(0.0, 4.0, 0.1) var gravity_multiplier: float = 1.6
## Wie schnell sich die Optik in Laufrichtung dreht (rad/s).
@export_range(1.0, 30.0, 0.5) var turn_speed: float = 12.0

@export_group("Raster (GRID)")
## Kantenlänge einer Zelle in Metern.
@export_range(0.5, 8.0, 0.5) var grid_size: float = 2.0
## Dauer eines Schrittes in Sekunden.
@export_range(0.05, 1.0, 0.01) var grid_step_time: float = 0.22
## Beim Start auf das Raster einrasten.
@export var snap_to_grid_on_start: bool = true

@export_group("Knoten")
## Node3D, das sich in Laufrichtung dreht (nur Optik).
@export var body_path: NodePath = ^"Body"
## Kamera-Drehpunkt; liefert die Blickrichtung für die Bewegung.
@export var camera_pivot_path: NodePath = ^"CameraPivot"
## RayCast3D für "interact".
@export var interact_ray_path: NodePath = ^"Body/InteractRay"

var _body: Node3D = null
var _camera_pivot: Node3D = null
var _interact_ray: RayCast3D = null

## Summe aller gelaufenen Meter (für Statistiken/Debug).
var distance_travelled: float = 0.0

# GRID-Zustand
var _step_from: Vector3 = Vector3.ZERO
var _step_to: Vector3 = Vector3.ZERO
var _step_progress: float = 0.0
var _is_stepping: bool = false


func _ready() -> void:
	_body = get_node_or_null(body_path) as Node3D
	_camera_pivot = get_node_or_null(camera_pivot_path) as Node3D
	_interact_ray = get_node_or_null(interact_ray_path) as RayCast3D
	if movement_mode == MovementMode.GRID and snap_to_grid_on_start:
		global_position = _snap(global_position)


func _physics_process(delta: float) -> void:
	var before: Vector3 = global_position
	if movement_mode == MovementMode.GRID:
		_process_grid(delta)
	else:
		_process_free(delta)
	_report_movement(before)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("interact"):
		var hit: Node3D = null
		if _interact_ray != null and _interact_ray.is_colliding():
			hit = _interact_ray.get_collider() as Node3D
		interacted.emit(hit)


# ---------------------------------------------------------------------------
# Freie Bewegung
# ---------------------------------------------------------------------------

func _process_free(delta: float) -> void:
	var gravity: float = float(ProjectSettings.get_setting(
		"physics/3d/default_gravity", 9.8)) * gravity_multiplier
	if not is_on_floor():
		velocity.y -= gravity * delta
	elif Input.is_action_just_pressed("jump") and jump_velocity > 0.0:
		velocity.y = jump_velocity

	var direction: Vector3 = _camera_relative_direction(_input_vector())
	var speed: float = walk_speed
	if Input.is_action_pressed("sprint"):
		speed *= sprint_multiplier

	var target: Vector3 = direction * speed
	velocity.x = move_toward(velocity.x, target.x, acceleration * speed * delta)
	velocity.z = move_toward(velocity.z, target.z, acceleration * speed * delta)
	move_and_slide()
	_face(direction, delta)


# ---------------------------------------------------------------------------
# Rasterbewegung
# ---------------------------------------------------------------------------

func _process_grid(delta: float) -> void:
	if _is_stepping:
		_step_progress = minf(1.0, _step_progress + delta / maxf(0.01, grid_step_time))
		# Sanftes Ein-/Ausblenden der Schrittgeschwindigkeit (ease-in-out).
		var t: float = _step_progress * _step_progress * (3.0 - 2.0 * _step_progress)
		global_position = _step_from.lerp(_step_to, t)
		if _step_progress >= 1.0:
			_is_stepping = false
			global_position = _step_to
			stepped.emit(Vector3i(
				roundi(_step_to.x / grid_size), 0, roundi(_step_to.z / grid_size)))
		return

	var raw: Vector2 = _input_vector()
	if raw.length_squared() < 0.04:
		return
	# Im Raster gibt es keine Diagonalen: die dominante Achse gewinnt.
	var dir: Vector3 = Vector3.FORWARD * signf(-raw.y) if absf(raw.y) >= absf(raw.x) \
		else Vector3.RIGHT * signf(raw.x)
	_face(dir, 1.0)

	var motion: Vector3 = dir * grid_size
	if test_move(global_transform, motion):
		return # Hindernis -> Schritt fällt aus (Blickrichtung bleibt gedreht)
	_step_from = global_position
	_step_to = _snap(global_position + motion)
	_step_progress = 0.0
	_is_stepping = true


func _snap(p: Vector3) -> Vector3:
	return Vector3(
		roundf(p.x / grid_size) * grid_size, p.y,
		roundf(p.z / grid_size) * grid_size)


# ---------------------------------------------------------------------------
# Hilfen
# ---------------------------------------------------------------------------

## Rohes Eingabe-Vektor (x = rechts, y = vorwärts negativ), Tastatur + Stick.
func _input_vector() -> Vector2:
	return Input.get_vector("move_left", "move_right", "move_forward", "move_back")


## Rechnet die Eingabe in Weltkoordinaten um -- relativ zur Kamera-Gierachse,
## damit "vorwärts" immer "weg vom Betrachter" heißt.
func _camera_relative_direction(input: Vector2) -> Vector3:
	if input.length_squared() < 0.01:
		return Vector3.ZERO
	var yaw: float = _camera_pivot.global_rotation.y if _camera_pivot != null else 0.0
	var basis_dir := Vector3(input.x, 0.0, input.y).rotated(Vector3.UP, yaw)
	return basis_dir.normalized()


## Dreht die Optik in Richtung [param dir]. [param delta] == 1.0 dreht sofort.
func _face(dir: Vector3, delta: float) -> void:
	if _body == null or dir.length_squared() < 0.01:
		return
	# Vorderseite des Meshes ist -Z: Gierwinkel, der -Z auf dir abbildet.
	var target_yaw: float = atan2(-dir.x, -dir.z)
	_body.rotation.y = rotate_toward(_body.rotation.y, target_yaw, turn_speed * delta) \
		if delta < 1.0 else target_yaw


## Meldet die tatsächlich gelaufene Horizontalstrecke (Basis fürs Encounter-System).
func _report_movement(previous: Vector3) -> void:
	var delta_pos: Vector3 = global_position - previous
	delta_pos.y = 0.0
	var dist: float = delta_pos.length()
	if dist > 0.0001:
		distance_travelled += dist
		moved.emit(dist)
