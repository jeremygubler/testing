extends Node

## Autoload singleton: the ONE place that decides which platform implementations
## the game uses. Everything else asks PlatformServices.save / .store / .input /
## .entitlements and never constructs a concrete service itself.
##
## To bring up the Switch build, the porting partner adds Switch* implementations
## under src/platform/switch/ and changes only _resolve_platform() below (ideally
## guarded by an export feature tag). sim/ and presentation/ stay untouched.

const LocalSaveService := preload("res://src/platform/local/LocalSaveService.gd")
const LocalEntitlementService := preload("res://src/platform/local/LocalEntitlementService.gd")
const MockStoreService := preload("res://src/platform/local/MockStoreService.gd")
const DesktopInputService := preload("res://src/platform/local/DesktopInputService.gd")

var save: ISaveService
var entitlements: IEntitlementService
var store: IStoreService
var input: IInputService


func _ready() -> void:
	_resolve_platform()


func _resolve_platform() -> void:
	# --- Platform selection point ---------------------------------------------
	# if OS.has_feature("switch"):
	#     save = SwitchSaveService.new()
	#     entitlements = SwitchEntitlementService.new(save)
	#     store = SwitchStoreService.new(entitlements)   # real eShop IAP
	#     input = SwitchInputService.new()
	#     return
	# --------------------------------------------------------------------------

	# Default: desktop / development stack with a fully local mock store.
	save = LocalSaveService.new()
	entitlements = LocalEntitlementService.new(save)
	store = MockStoreService.new(entitlements)
	input = DesktopInputService.new()


## Feed raw Godot input into the active input service (called from Main).
func feed_input_event(event: InputEvent, board_hex: Vector2i) -> void:
	if input is DesktopInputService:
		(input as DesktopInputService).handle_event(event, board_hex)
