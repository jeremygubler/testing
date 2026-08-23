extends CanvasLayer

## Schlichtes Overworld-HUD: Teamübersicht, Zonenname, Kurzmeldungen ("Toasts")
## und die Tastenhilfe.
##
## Liest nur aus [GameState] und reagiert auf dessen Signale -- kein Schreiben,
## keine Spiellogik. Fehlt ein Knoten, wird die Anzeige einfach übersprungen,
## damit die Overworld auch ohne HUD lauffähig bleibt.

const P_PARTY := "Root/TopLeft/PartyLabel"
const P_ZONE := "Root/TopRight/ZoneLabel"
const P_TOAST := "Root/Bottom/ToastLabel"
const P_HINTS := "Root/Bottom/HintLabel"

## Anzeigedauer einer Kurzmeldung.
@export_range(0.5, 10.0, 0.5) var toast_seconds: float = 2.5
@export var hint_text: String = "WASD Laufen · Maus/Rechtsklick Kamera · Rad Zoom · " \
	+ "E Interagieren · F1 Testkampf · F5 Speichern · F9 Laden · Esc Maus"

var _party_label: Label = null
var _zone_label: Label = null
var _toast_label: Label = null
var _toast_left: float = 0.0


func _ready() -> void:
	_party_label = get_node_or_null(P_PARTY) as Label
	_zone_label = get_node_or_null(P_ZONE) as Label
	_toast_label = get_node_or_null(P_TOAST) as Label
	var hints := get_node_or_null(P_HINTS) as Label
	if hints != null:
		hints.text = hint_text
	if _toast_label != null:
		_toast_label.text = ""
	GameState.party_changed.connect(_refresh_party)
	GameState.inventory_changed.connect(_refresh_party)
	GameState.money_changed.connect(func(_amount: int) -> void: _refresh_party())
	_refresh_party()
	set_zone_name("")


func _process(delta: float) -> void:
	if _toast_left <= 0.0:
		return
	_toast_left -= delta
	if _toast_left <= 0.0 and _toast_label != null:
		_toast_label.text = ""


## Zeigt eine Kurzmeldung an (Speichern, Zonenwechsel, Kampfergebnis).
func show_toast(text: String) -> void:
	if _toast_label == null:
		return
	_toast_label.text = text
	_toast_left = toast_seconds


func set_zone_name(zone_name: String) -> void:
	if _zone_label == null:
		return
	_zone_label.text = "" if zone_name == "" else "Zone: %s" % zone_name


func _refresh_party() -> void:
	if _party_label == null:
		return
	var lines: Array[String] = ["Münzen: %d   Bälle: %d" % [
		GameState.money, GameState.item_count("capture_orb")]]
	for i in GameState.party.size():
		var mon: MonsterInstance = GameState.party[i]
		lines.append("%d. %s  Lv%d  %d/%d KP%s" % [
			i + 1, mon.display_name(), mon.level, mon.current_hp, mon.max_hp(),
			"" if mon.status == StatusAilments.Status.NONE
				else "  " + StatusAilments.label(int(mon.status)),
		])
	_party_label.text = "\n".join(lines)
