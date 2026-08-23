class_name MoveDefinition
extends Resource

## Eine Attacke als eigenständige Resource (`resources/moves/*.tres`).
##
## Attacken sind reine Daten: Der Kampfcode ([DamageCalculator],
## [BattleManager]) liest diese Felder und braucht kein Wissen über einzelne
## Attacken. Neue Attacke = neues .tres im Editor, kein Code-Change.

enum Category {
	PHYSICAL, ## nutzt ATK gegen DEF
	SPECIAL,  ## nutzt SPA gegen SPD
	STATUS,   ## kein Schaden, nur Effekt
}

@export_group("Identität")
## Stabile, technische ID (snake_case). Muss projektweit eindeutig sein --
## Speicherstände referenzieren Attacken über diese ID, nicht über den Pfad.
@export var id: String = ""
@export var display_name: String = ""
@export_multiline var description: String = ""

@export_group("Kampfwerte")
@export var element: Elements.Kind = Elements.Kind.NEUTRAL
@export var category: Category = Category.PHYSICAL
## 0 bei Status-Attacken.
@export_range(0, 250, 5) var power: int = 40
## Trefferquote in Prozent. 0 bedeutet "trifft immer".
@export_range(0, 100, 1) var accuracy: int = 100
@export_range(1, 60, 1) var max_pp: int = 20
## Höhere Priorität handelt zuerst, unabhängig von der Initiative.
@export_range(-6, 6, 1) var priority: int = 0
## Verdoppelte Chance auf einen Volltreffer.
@export var high_crit: bool = false

@export_group("Zusatzeffekt")
@export var effect: MoveEffects.Effect = MoveEffects.Effect.NONE
## Auslösewahrscheinlichkeit in Prozent (100 = immer).
@export_range(0, 100, 1) var effect_chance: int = 100
## true = Effekt trifft den Anwender (Buff/Heilung), false = das Ziel.
@export var targets_self: bool = false
## Für STAT_CHANGE.
@export var effect_stat: Stats.Stat = Stats.Stat.ATK
@export_range(-6, 6, 1) var effect_stages: int = 0
## Für INFLICT_STATUS.
@export var effect_status: StatusAilments.Status = StatusAilments.Status.NONE
## Anteil für DRAIN / RECOIL / HEAL (0.5 = 50 %).
@export_range(0.0, 1.0, 0.05) var effect_ratio: float = 0.5


func is_damaging() -> bool:
	return category != Category.STATUS and power > 0


## Kurzbeschreibung für die UI, z.B. "Glut · Speziell · 45 / 100%".
func summary() -> String:
	var cat_label: String = ["Phys", "Spez", "Status"][category]
	if is_damaging():
		return "%s · %s · %d / %d%%" % [
			Elements.label(element), cat_label, power,
			100 if accuracy == 0 else accuracy,
		]
	return "%s · %s" % [Elements.label(element), cat_label]
