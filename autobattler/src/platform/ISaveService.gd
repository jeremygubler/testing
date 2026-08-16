class_name ISaveService
extends RefCounted

## Platform-agnostic persistence interface.
##
## Game code NEVER touches FileAccess or a console-specific save API directly.
## Desktop uses LocalSaveService (user:// files). A Switch port will implement
## this same interface against the Nintendo save-data API inside the porting
## partner's platform layer — no changes needed in sim/ or presentation/.
##
## All methods are synchronous in the mock; real console saves may be async, so
## implementations should treat these as "best effort, may block briefly" and can
## queue writes internally. Keys are opaque slot identifiers (e.g. "profile", "run").

## Returns true if a value exists for `key`.
func has(key: String) -> bool:
	push_error("ISaveService.has() not implemented")
	return false


## Persist an arbitrary JSON-serialisable Dictionary under `key`. Returns success.
func save(key: String, data: Dictionary) -> bool:
	push_error("ISaveService.save() not implemented")
	return false


## Load a previously saved Dictionary. Returns `default` if absent/corrupt.
func load_data(key: String, default: Dictionary = {}) -> Dictionary:
	push_error("ISaveService.load_data() not implemented")
	return default


## Delete a saved value. Returns success (true even if key was absent).
func erase(key: String) -> bool:
	push_error("ISaveService.erase() not implemented")
	return false
