class_name MonsterInstance
extends Resource

## Ein *konkretes* Monster im Besitz des Spielers oder eines Gegners.
##
## Trennung mit Absicht: [MonsterSpecies] ist unveränderliche Design-Daten,
## [MonsterInstance] ist veränderlicher Spielstand. Deshalb wird hier nur die
## Art-*ID* gespeichert -- ein Speicherstand bleibt gültig, auch wenn die
## .tres-Datei der Art später umbenannt oder umgebaut wird.
##
## Kampf-spezifischer Kram (Stat-Stufen, Rundenzähler) steht *nicht* hier,
## sondern in [BattleCombatant]: so kann ein Kampf nichts dauerhaft verbiegen,
## was nicht gespeichert werden soll.

@export var species_id: String = ""
## Optionaler Spitzname; leer = Anzeigename der Art.
@export var nickname: String = ""
@export_range(1, 100, 1) var level: int = 5
## Gesamte gesammelte EP (nicht "EP bis zum nächsten Level").
@export var experience: int = 0
## Individuelle Talentwerte, 0..[constant Stats.IV_MAX], je Stat.
@export var ivs: Array[int] = [0, 0, 0, 0, 0, 0]
@export var current_hp: int = 0
@export var status: StatusAilments.Status = StatusAilments.Status.NONE
## Restliche Schlafrunden (nur relevant bei status == SLEEP).
@export var sleep_turns: int = 0
@export var moves: Array[MoveSlot] = []

var _species_cache: MonsterSpecies = null


## Erzeugt ein frisches Monster einer Art auf [param level].
## [param rng] macht die Talentwerte reproduzierbar -- immer den Kampf-/
## Encounter-RNG durchreichen, nie `randi()` benutzen.
static func create(p_species_id: String, p_level: int,
		rng: RandomNumberGenerator = null) -> MonsterInstance:
	var inst := MonsterInstance.new()
	inst.species_id = p_species_id
	inst.level = maxi(1, p_level)
	inst.experience = Stats.exp_for_level(inst.level)
	var iv_list: Array[int] = []
	for i in Stats.COUNT:
		iv_list.append(rng.randi_range(0, Stats.IV_MAX) if rng != null else Stats.IV_MAX / 2)
	inst.ivs = iv_list
	inst.relearn_default_moves()
	inst.current_hp = inst.max_hp()
	return inst


## Art aus der Datenbank (gecacht). Null, wenn die ID unbekannt ist.
func species() -> MonsterSpecies:
	if _species_cache == null or _species_cache.id != species_id:
		_species_cache = MonsterDatabase.get_species(species_id)
	return _species_cache


func display_name() -> String:
	if nickname != "":
		return nickname
	var sp: MonsterSpecies = species()
	return sp.display_name if sp != null else species_id


func types() -> Array[int]:
	var sp: MonsterSpecies = species()
	if sp != null:
		return sp.types()
	var fallback: Array[int] = [int(Elements.Kind.NEUTRAL)]
	return fallback


func iv(stat: int) -> int:
	return ivs[stat] if stat >= 0 and stat < ivs.size() else 0


## Statuswert ohne Kampf-Modifikatoren (die addiert [BattleCombatant]).
func base_value(stat: int) -> int:
	var sp: MonsterSpecies = species()
	if sp == null:
		return 1
	if stat == Stats.Stat.HP:
		return Stats.max_hp(sp.base_hp, level, iv(stat))
	return Stats.other_stat(sp.base_stat(stat), level, iv(stat))


func max_hp() -> int:
	return base_value(Stats.Stat.HP)


func is_fainted() -> bool:
	return current_hp <= 0


func hp_ratio() -> float:
	var m: int = max_hp()
	return 0.0 if m <= 0 else clampf(float(current_hp) / float(m), 0.0, 1.0)


## Setzt KP und begrenzt sie auf 0..max. Gibt die tatsächliche Änderung zurück.
func apply_hp_delta(delta: int) -> int:
	var before: int = current_hp
	current_hp = clampi(current_hp + delta, 0, max_hp())
	return current_hp - before


func heal_fully() -> void:
	current_hp = max_hp()
	status = StatusAilments.Status.NONE
	sleep_turns = 0
	for slot in moves:
		slot.restore()


## Ersetzt die Attackenliste durch die vier neuesten lernbaren Attacken.
func relearn_default_moves() -> void:
	var sp: MonsterSpecies = species()
	moves = []
	if sp == null:
		return
	var learnable: Array[MoveDefinition] = sp.moves_up_to_level(level)
	# Die vier *zuletzt* gelernten Attacken sind die interessantesten.
	var start: int = maxi(0, learnable.size() - MonsterDatabase.max_moves())
	for i in range(start, learnable.size()):
		moves.append(MoveSlot.create(learnable[i]))


## Lernt eine Attacke. Ist die Liste voll, wird [param replace_index] ersetzt
## (bei -1 passiert dann nichts -- die UI muss den Spieler fragen).
## Rückgabe: true, wenn die Attacke jetzt bekannt ist.
func learn_move(move: MoveDefinition, replace_index: int = -1) -> bool:
	if move == null or knows_move(move.id):
		return false
	if moves.size() < MonsterDatabase.max_moves():
		moves.append(MoveSlot.create(move))
		return true
	if replace_index >= 0 and replace_index < moves.size():
		moves[replace_index] = MoveSlot.create(move)
		return true
	return false


func knows_move(move_id: String) -> bool:
	for slot in moves:
		if slot.move_id == move_id:
			return true
	return false


func usable_move_slots() -> Array[MoveSlot]:
	var out: Array[MoveSlot] = []
	for slot in moves:
		if slot.is_usable():
			out.append(slot)
	return out


func experience_to_next_level() -> int:
	return maxi(0, Stats.exp_for_level(level + 1) - experience)


## Vergibt EP und wickelt alle daraus folgenden Levelaufstiege ab.
## Rückgabe: Liste der Ereignisse, z.B.
## [code][{"level": 7}, {"level": 8, "learned": [MoveDefinition]}][/code].
func gain_experience(amount: int) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	if amount <= 0:
		return events
	experience += amount
	var sp: MonsterSpecies = species()
	while level < MonsterDatabase.max_level() \
			and experience >= Stats.exp_for_level(level + 1):
		var hp_before: int = max_hp()
		level += 1
		# Beim Aufstieg wachsen die max. KP -- die aktuellen KP wachsen mit,
		# damit ein Levelaufstieg nie "gefühlt" Schaden macht.
		current_hp += maxi(0, max_hp() - hp_before)
		var learned: Array[MoveDefinition] = []
		if sp != null:
			for m in sp.moves_learned_at(level):
				if learn_move(m):
					learned.append(m)
		events.append({"level": level, "learned": learned})
	return events


## Prüft die Entwicklungsbedingung und wandelt die Art um.
## Rückgabe: die neue Art oder null.
func try_evolve() -> MonsterSpecies:
	var sp: MonsterSpecies = species()
	if sp == null or not sp.can_evolve_at(level):
		return null
	var next: MonsterSpecies = MonsterDatabase.get_species(sp.evolves_into)
	if next == null:
		push_warning("Entwicklung '%s' unbekannt (Art '%s')" % [sp.evolves_into, sp.id])
		return null
	var ratio: float = hp_ratio()
	species_id = next.id
	_species_cache = next
	current_hp = maxi(1, int(round(ratio * float(max_hp()))))
	# Neu freigeschaltete Attacken der Entwicklung nachziehen.
	for m in next.moves_learned_at(level):
		learn_move(m)
	return next


# ---------------------------------------------------------------------------
# Serialisierung (JSON-Speicherstand)
# ---------------------------------------------------------------------------

func to_dict() -> Dictionary:
	var move_data: Array = []
	for slot in moves:
		move_data.append(slot.to_dict())
	return {
		"species_id": species_id,
		"nickname": nickname,
		"level": level,
		"experience": experience,
		"ivs": ivs.duplicate(),
		"current_hp": current_hp,
		"status": int(status),
		"sleep_turns": sleep_turns,
		"moves": move_data,
	}


static func from_dict(d: Dictionary) -> MonsterInstance:
	var inst := MonsterInstance.new()
	inst.species_id = String(d.get("species_id", ""))
	inst.nickname = String(d.get("nickname", ""))
	inst.level = int(d.get("level", 5))
	inst.experience = int(d.get("experience", Stats.exp_for_level(inst.level)))
	var iv_list: Array[int] = []
	# JSON liefert Zahlen als float -> explizit casten.
	for v in d.get("ivs", []):
		iv_list.append(int(v))
	while iv_list.size() < Stats.COUNT:
		iv_list.append(0)
	inst.ivs = iv_list
	inst.status = int(d.get("status", StatusAilments.Status.NONE)) as StatusAilments.Status
	inst.sleep_turns = int(d.get("sleep_turns", 0))
	var slots: Array[MoveSlot] = []
	for md in d.get("moves", []):
		slots.append(MoveSlot.from_dict(md))
	inst.moves = slots
	inst.current_hp = clampi(int(d.get("current_hp", 0)), 0, inst.max_hp())
	return inst


func duplicate_instance() -> MonsterInstance:
	return MonsterInstance.from_dict(to_dict())
