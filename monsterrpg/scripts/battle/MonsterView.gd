class_name MonsterView
extends Node3D

## Platzhalter-Darstellung eines Monsters im Kampf.
##
## Solange es keine Modelle gibt, wird ein Primitiv (Kapsel + Box als "Schnauze")
## in der Farbe und Größe aus [MonsterSpecies] eingefärbt. Wer später echte
## Modelle einbaut, ersetzt nur [method show_monster] -- der Kampfcode kennt
## diese Klasse gar nicht, [Battle] hängt sie an die Signale.

@export var mesh_path: NodePath = ^"Body"
## Stärke der Leerlauf-Bewegung (0 = aus).
@export_range(0.0, 0.5, 0.01) var bob_amplitude: float = 0.06
@export_range(0.1, 5.0, 0.1) var bob_speed: float = 1.8

var _body: Node3D = null
var _base_y: float = 0.0
var _time: float = 0.0
var _fainted: bool = false


func _ready() -> void:
	_body = get_node_or_null(mesh_path) as Node3D
	if _body != null:
		_base_y = _body.position.y


func _process(delta: float) -> void:
	if _body == null or _fainted or bob_amplitude <= 0.0:
		return
	_time += delta * bob_speed
	_body.position.y = _base_y + sin(_time) * bob_amplitude


## Zeigt ein Monster an (Farbe/Größe aus der Art) und setzt die Pose zurück.
func show_monster(monster: MonsterInstance) -> void:
	_fainted = false
	if _body == null:
		return
	_body.rotation = Vector3.ZERO
	_body.position.y = _base_y
	var species: MonsterSpecies = monster.species()
	if species == null:
		return
	_body.scale = species.placeholder_scale
	_apply_color(_body, species.placeholder_color)


## Kippt das Monster zur Seite -- "besiegt" ohne Animationssystem.
func play_faint() -> void:
	_fainted = true
	if _body == null:
		return
	_body.rotation.z = deg_to_rad(-80.0)
	_body.position.y = _base_y - 0.3


## Färbt alle MeshInstance3D unter [param node] mit einem Override-Material.
func _apply_color(node: Node, color: Color) -> void:
	var mesh_instance := node as MeshInstance3D
	if mesh_instance != null:
		var material := StandardMaterial3D.new()
		material.albedo_color = color
		material.roughness = 0.7
		mesh_instance.material_override = material
	for child in node.get_children():
		_apply_color(child, color)
