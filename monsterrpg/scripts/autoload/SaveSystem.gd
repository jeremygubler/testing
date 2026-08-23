extends Node

## Autoload "SaveSystem" -- Speichern/Laden mit zwei austauschbaren Backends.
##
##   * [constant Format.JSON]: `FileAccess` + `JSON.stringify` -> lesbare
##     `user://slot_0.json`. Gut zum Debuggen und für Bug-Reports.
##   * [constant Format.TRES]: `ResourceSaver`/`ResourceLoader` mit der
##     [SaveGame]-Resource -> `user://slot_0.tres`.
##
## Beide schreiben denselben Inhalt ([method GameState.to_dict]), damit man
## jederzeit wechseln kann. Der Rest des Spiels ruft nur
## [method save_game] / [method load_game] auf.
##
## `user://` liegt unter Linux in `~/.local/share/godot/app_userdata/<Projekt>/`.

enum Format { JSON, TRES }

signal game_saved(slot: int, path: String)
signal game_loaded(slot: int, path: String)
signal save_failed(slot: int, reason: String)

## Standard-Backend. Für den .tres-Weg einfach auf Format.TRES stellen.
@export var format: Format = Format.JSON

const MAX_SLOTS: int = 3


## Vollständiger Pfad eines Slots im aktuellen (oder erzwungenen) Format.
func slot_path(slot: int, forced_format: int = -1) -> String:
	var fmt: int = forced_format if forced_format >= 0 else int(format)
	var ext: String = "json" if fmt == Format.JSON else "tres"
	return "user://slot_%d.%s" % [slot, ext]


func has_save(slot: int) -> bool:
	return FileAccess.file_exists(slot_path(slot, Format.JSON)) \
		or FileAccess.file_exists(slot_path(slot, Format.TRES))


## Alle belegten Slots (für ein Ladenmenü).
func used_slots() -> Array[int]:
	var out: Array[int] = []
	for i in MAX_SLOTS:
		if has_save(i):
			out.append(i)
	return out


func delete_save(slot: int) -> void:
	for fmt in [Format.JSON, Format.TRES]:
		var path: String = slot_path(slot, fmt)
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(path)


## Schreibt den aktuellen [GameState] in einen Slot. Rückgabe: Erfolg.
func save_game(slot: int = 0) -> bool:
	var data: Dictionary = GameState.to_dict()
	var path: String = slot_path(slot)
	var ok: bool = _write_json(path, data) if format == Format.JSON \
		else _write_tres(path, data)
	if ok:
		game_saved.emit(slot, path)
		print("[SaveSystem] Gespeichert: %s" % path)
	else:
		save_failed.emit(slot, "Schreiben fehlgeschlagen: %s" % path)
	return ok


## Lädt einen Slot in den [GameState]. Findet das Format automatisch, damit
## alte JSON-Stände nach einem Backend-Wechsel weiter funktionieren.
func load_game(slot: int = 0) -> bool:
	for fmt in [int(format), Format.JSON, Format.TRES]:
		var path: String = slot_path(slot, fmt)
		if not FileAccess.file_exists(path):
			continue
		var data: Dictionary = _read_json(path) if fmt == Format.JSON \
			else _read_tres(path)
		if data.is_empty():
			continue
		GameState.from_dict(data)
		game_loaded.emit(slot, path)
		print("[SaveSystem] Geladen: %s" % path)
		return true
	push_warning("[SaveSystem] Kein Speicherstand in Slot %d." % slot)
	return false


## Kurzinfo eines Slots für ein Menü, ohne den Spielstand zu überschreiben.
## Rückgabe: {} wenn der Slot leer ist.
func peek(slot: int) -> Dictionary:
	for fmt in [Format.JSON, Format.TRES]:
		var path: String = slot_path(slot, fmt)
		if not FileAccess.file_exists(path):
			continue
		var data: Dictionary = _read_json(path) if fmt == Format.JSON \
			else _read_tres(path)
		if data.is_empty():
			continue
		var party: Array = data.get("party", []) as Array
		var lead_level: int = 0
		if party.size() > 0:
			lead_level = int((party[0] as Dictionary).get("level", 0))
		return {
			"slot": slot,
			"path": path,
			"party_size": party.size(),
			"lead_level": lead_level,
			"play_time": float(data.get("play_time", 0.0)),
			"money": int(data.get("money", 0)),
		}
	return {}


# ---------------------------------------------------------------------------
# Backend: JSON über FileAccess
# ---------------------------------------------------------------------------

func _write_json(path: String, data: Dictionary) -> bool:
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		push_error("[SaveSystem] FileAccess-Fehler %d bei %s"
			% [FileAccess.get_open_error(), path])
		return false
	# "\t" als Einrückung -> Speicherstände sind diff-bar.
	file.store_string(JSON.stringify(data, "\t"))
	file.close()
	return true


func _read_json(path: String) -> Dictionary:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {}
	var text: String = file.get_as_text()
	file.close()
	var parsed: Variant = JSON.parse_string(text)
	if parsed is Dictionary:
		return parsed as Dictionary
	push_error("[SaveSystem] Kaputter Speicherstand: %s" % path)
	return {}


# ---------------------------------------------------------------------------
# Backend: SaveGame-Resource über ResourceSaver
# ---------------------------------------------------------------------------

func _write_tres(path: String, data: Dictionary) -> bool:
	var res := SaveGame.new()
	res.version = GameState.SAVE_VERSION
	res.saved_at = Time.get_datetime_string_from_system(false, true)
	res.data = data
	var err: int = ResourceSaver.save(res, path)
	if err != OK:
		push_error("[SaveSystem] ResourceSaver-Fehler %d bei %s" % [err, path])
		return false
	return true


func _read_tres(path: String) -> Dictionary:
	# CACHE_MODE_IGNORE: sonst liefert ein zweites Laden den gecachten Stand.
	var res: Resource = ResourceLoader.load(path, "SaveGame",
		ResourceLoader.CACHE_MODE_IGNORE)
	if res is SaveGame:
		return (res as SaveGame).data
	push_error("[SaveSystem] Kein SaveGame in %s" % path)
	return {}
