class_name MoveSlot
extends Resource

## Eine gelernte Attacke *an einem konkreten Monster*: Referenz + aktuelle PP.
##
## Speichert absichtlich nur die Move-ID und nicht die Resource selbst, damit
## Speicherstände (JSON) versionsstabil bleiben.

@export var move_id: String = ""
@export var pp: int = 0


static func create(move: MoveDefinition) -> MoveSlot:
	var slot := MoveSlot.new()
	slot.move_id = move.id
	slot.pp = move.max_pp
	return slot


## Aufgelöste Attacke aus der Datenbank (null, wenn die ID unbekannt ist).
func definition() -> MoveDefinition:
	return MonsterDatabase.get_move(move_id)


func max_pp() -> int:
	var def: MoveDefinition = definition()
	return def.max_pp if def != null else 0


func is_usable() -> bool:
	return pp > 0 and definition() != null


func restore() -> void:
	pp = max_pp()


func to_dict() -> Dictionary:
	return {"move_id": move_id, "pp": pp}


static func from_dict(d: Dictionary) -> MoveSlot:
	var slot := MoveSlot.new()
	slot.move_id = String(d.get("move_id", ""))
	slot.pp = int(d.get("pp", 0))
	return slot
