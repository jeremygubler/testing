extends IEntitlementService

## Development entitlement store. Owned skins + per-hero applied skin selection
## are persisted through ISaveService, so this same logic works on any platform;
## only the underlying save backend changes.

const _SAVE_KEY := "entitlements"

var _save: ISaveService
var _owned: Dictionary = {}          # entitlement_id -> true
var _applied: Dictionary = {}        # hero_id -> skin_id


func _init(save_service: ISaveService) -> void:
	_save = save_service
	_load()


func _load() -> void:
	var data := _save.load_data(_SAVE_KEY, {"owned": {}, "applied": {}})
	_owned = data.get("owned", {})
	_applied = data.get("applied", {})


func _persist() -> void:
	_save.save(_SAVE_KEY, {"owned": _owned, "applied": _applied})


func owns(entitlement_id: String) -> bool:
	return _owned.get(entitlement_id, false) == true


func grant(entitlement_id: String) -> void:
	if owns(entitlement_id):
		return
	_owned[entitlement_id] = true
	_persist()
	entitlement_changed.emit(entitlement_id, true)


func owned_ids() -> Array[String]:
	var out: Array[String] = []
	for k in _owned.keys():
		if _owned[k] == true:
			out.append(k)
	return out


func apply_skin(hero_id: String, skin_id: String) -> bool:
	if skin_id != "" and not owns(skin_id):
		return false
	_applied[hero_id] = skin_id
	_persist()
	skin_applied.emit(hero_id, skin_id)
	return true


func get_applied_skin(hero_id: String) -> String:
	return _applied.get(hero_id, "")
