class_name GameState
extends RefCounted

## Top-level game/run state: roster (bench + board), economy, shop, player HP, and
## the round loop (shop -> placement -> combat -> result). Pure simulation; the
## presentation layer drives it via these methods and reads state back. Fully
## deterministic given the initial seed.

enum Phase { SHOP, COMBAT, RESULT, GAME_OVER }

const BENCH_SIZE := 9

signal phase_changed(phase: Phase)
signal roster_changed()
signal hp_changed(hp: int)
signal round_changed(round_number: int)
signal combat_resolved(result: Dictionary)
signal items_changed()
signal augments_offered(choices: Array)   # Array[String] of augment ids
signal augment_chosen(augment_id: String)

var phase: int = Phase.SHOP
var round_number: int = 0
var player_hp: int
var economy: Economy
var pool: HeroPool
var shop: Shop

var roster: Array = []          # Array[GameUnit] (bench + board)
var item_inventory: Array[String] = []  # unassigned item ids the player holds
var augments: Array[String] = []        # chosen augment ids
var pending_augments: Array[String] = []  # augment ids currently offered (choose one)
var last_result: Dictionary = {}

var _augment_offered_round: int = -1     # last round an offer was made (avoid repeats)

var _rng: DeterministicRng
var _combat_rng: DeterministicRng
var _uid: int = 1
var _seed: int


func _init(seed_value: int = 0) -> void:
	_seed = seed_value
	_rng = DeterministicRng.new(seed_value)
	_combat_rng = DeterministicRng.new(seed_value ^ 0x5DEECE66D)
	economy = Economy.new()
	pool = HeroPool.new()
	shop = Shop.new(pool, _rng)
	player_hp = int(GameDatabase.cfg("player", {}).get("starting_hp", 100))


## Begin the very first round (income + free shop roll).
func start_game() -> void:
	round_number = 0
	begin_next_round()


# --- Round loop --------------------------------------------------------------

## Returns the income breakdown Dictionary for logging/UI.
func begin_next_round() -> Dictionary:
	round_number += 1
	round_changed.emit(round_number)
	var income := economy.grant_round_income()
	last_result = {}
	shop.roll(economy.level)  # free roll at the start of each round
	_maybe_offer_augments()
	_set_phase(Phase.SHOP)
	return income


## Player ends the shop phase and starts the auto-battle against a PvE opponent.
## Returns the combat result Dictionary.
func start_combat() -> Dictionary:
	_set_phase(Phase.COMBAT)
	var opponent := OpponentFactory.build(round_number, _rng)
	var engine := CombatEngine.new(board_units(), opponent, _next_combat_seed(), player_combat_mods())
	var result := engine.run_to_completion()
	_resolve_combat(result, opponent)
	return result


## Same as start_combat but returns the live engine so the presentation layer can
## step it for animation. Caller must call resolve_combat(result, opponent) when
## the engine finishes.
func begin_combat_engine() -> Dictionary:
	_set_phase(Phase.COMBAT)
	var opponent := OpponentFactory.build(round_number, _rng)
	var engine := CombatEngine.new(board_units(), opponent, _next_combat_seed(), player_combat_mods())
	return {"engine": engine, "opponent": opponent}


func resolve_combat(result: Dictionary, opponent: Array) -> void:
	_resolve_combat(result, opponent)


func _resolve_combat(result: Dictionary, _opponent: Array) -> void:
	last_result = result
	var won: bool = result.get("winner", -1) == 0
	economy.register_result(won)
	if not won:
		var cfg: Dictionary = GameDatabase.cfg("combat", {})
		var base := int(cfg.get("player_damage_base", 3))
		var per_star := int(cfg.get("player_damage_per_surviving_star", 2))
		var enemy_stars: int = result.get("surviving_stars", [0, 0])[1]
		var dmg := base + per_star * enemy_stars
		player_hp = max(0, player_hp - dmg)
		hp_changed.emit(player_hp)
		result["player_damage"] = dmg
	else:
		result["player_damage"] = 0
	if won:
		result["rewards"] = _grant_round_rewards()
	combat_resolved.emit(result)
	if player_hp <= 0:
		_set_phase(Phase.GAME_OVER)
	else:
		_set_phase(Phase.RESULT)


## Grant this round's win rewards (gold + item components) from config. Returns a
## short human-readable summary (e.g. "+1g, Aether Bow") or "" if nothing dropped.
## Deterministic: component choices come from the game RNG stream.
func _grant_round_rewards() -> String:
	var cfg: Dictionary = GameDatabase.cfg("rewards", {})
	var parts: Array[String] = []
	var gold := int(cfg.get("win_gold_bonus", 0))
	var drops: Array = cfg.get("round_drops", {}).get(str(round_number), [])
	for drop in drops:
		match drop.get("type", ""):
			"gold":
				gold += int(drop.get("amount", 0))
			"component":
				var comp := _random_component()
				if comp != null:
					item_inventory.append(comp.id)
					parts.append(comp.name)
			"item":
				var item_id := String(drop.get("id", ""))
				if GameDatabase.get_item(item_id) != null:
					item_inventory.append(item_id)
					parts.append(GameDatabase.get_item(item_id).name)
	if gold > 0:
		economy.add_gold(gold)
		parts.insert(0, "+%dg" % gold)
	if not item_inventory.is_empty():
		items_changed.emit()
	return ", ".join(parts)


func _random_component() -> ItemDef:
	var comps: Array = GameDatabase.all_components()
	if comps.is_empty():
		return null
	return comps[_rng.randi_below(comps.size())]


func _next_combat_seed() -> int:
	# Deterministic but distinct per combat.
	return _combat_rng.next_raw()


func _set_phase(p: int) -> void:
	phase = p
	phase_changed.emit(phase)


# --- Roster queries ----------------------------------------------------------

func bench_units() -> Array:
	return roster.filter(func(u): return not u.is_on_board())


func board_units() -> Array:
	return roster.filter(func(u): return u.is_on_board())


func board_count() -> int:
	return board_units().size()


func bench_count() -> int:
	return bench_units().size()


func _first_free_bench_index() -> int:
	var used := {}
	for u in bench_units():
		used[u.bench_index] = true
	for i in BENCH_SIZE:
		if not used.has(i):
			return i
	return -1


func _hex_occupied_by(pos: Vector2i) -> GameUnit:
	for u in board_units():
		if u.board_pos == pos:
			return u
	return null


func count_copies(hero_id: String, star: int) -> int:
	var n := 0
	for u in roster:
		if u.hero.id == hero_id and u.star == star:
			n += 1
	return n


# --- Shop interactions -------------------------------------------------------

func reroll() -> bool:
	var cost := int(GameDatabase.cfg("economy", {}).get("reroll_cost", 2))
	if not economy.spend(cost):
		return false
	shop.roll(economy.level)
	return true


func buy_xp() -> bool:
	var ok := economy.buy_xp()
	if ok:
		roster_changed.emit()  # board capacity may have changed
	return ok


## Buy the shop offer at `slot`. Handles gold, pool, bench space, and auto-combine.
func buy(slot: int) -> bool:
	var hero: HeroDef = shop.offers[slot] if slot >= 0 and slot < shop.offers.size() else null
	if hero == null:
		return false
	if not economy.can_afford(hero.cost):
		return false
	# Determine whether this purchase can be held: either a free bench slot exists,
	# or it immediately completes a 1-star combine (freeing the slot again).
	var will_combine := count_copies(hero.id, 1) >= 2
	var free_index := _first_free_bench_index()
	if free_index < 0 and not will_combine:
		return false
	# Commit: take from the shared pool, charge gold, create the unit.
	var bought := shop.buy_slot(slot)
	if bought == null:
		return false
	if not economy.spend(hero.cost):
		pool.give(hero.id, 1)  # refund pool on the (shouldn't-happen) failure
		return false
	var gu := GameUnit.new(_uid, hero, 1)
	_uid += 1
	gu.bench_index = free_index if free_index >= 0 else BENCH_SIZE  # temp overflow slot
	roster.append(gu)
	_combine(hero.id)
	roster_changed.emit()
	return true


## Sell a unit: refund gold, return copies to the pool, return items to the
## inventory, and remove from roster.
func sell(unit: GameUnit) -> bool:
	if unit == null or not roster.has(unit):
		return false
	economy.add_gold(unit.sell_value())
	pool.give(unit.hero.id, unit.star)
	for item_id in unit.items:
		item_inventory.append(item_id)
	roster.erase(unit)
	roster_changed.emit()
	if not unit.items.is_empty():
		items_changed.emit()
	return true


# --- Items -------------------------------------------------------------------

## Add an item id to the player's inventory (rewards / debug).
func grant_item(item_id: String) -> void:
	if GameDatabase.get_item(item_id) == null:
		return
	item_inventory.append(item_id)
	items_changed.emit()


## Assign an inventory item to a unit. If the item is a component and the unit
## already holds a component that completes a recipe, the two combine into the
## completed item (freeing a slot). Otherwise the item is equipped if the unit has
## a free slot (max 3). Returns true on success.
func assign_item(unit: GameUnit, item_id: String) -> bool:
	if unit == null or not roster.has(unit):
		return false
	if not item_inventory.has(item_id):
		return false
	var item: ItemDef = GameDatabase.get_item(item_id)
	if item == null:
		return false

	# Try to complete a recipe with an existing component on the unit.
	if item.is_component():
		for i in unit.items.size():
			var held: ItemDef = GameDatabase.get_item(unit.items[i])
			if held != null and held.is_component():
				var result := GameDatabase.recipe_result(held.id, item.id)
				if result != null:
					unit.items[i] = result.id
					item_inventory.erase(item_id)
					roster_changed.emit()
					items_changed.emit()
					return true

	# Otherwise equip into a free slot.
	if unit.items.size() >= GameUnit.MAX_ITEMS:
		return false
	unit.items.append(item_id)
	item_inventory.erase(item_id)
	roster_changed.emit()
	items_changed.emit()
	return true


## Remove an item from a unit and return it to the inventory. Returns true on
## success. (Completed items return as-is; they are not decomposed.)
func unequip_item(unit: GameUnit, slot: int) -> bool:
	if unit == null or not roster.has(unit):
		return false
	if slot < 0 or slot >= unit.items.size():
		return false
	var item_id: String = unit.items[slot]
	unit.items.remove_at(slot)
	item_inventory.append(item_id)
	roster_changed.emit()
	items_changed.emit()
	return true


# --- Placement ---------------------------------------------------------------

## Place/move a unit onto a board hex. Enforces board capacity and swaps if the
## target hex is occupied by another of the player's units.
func place_on_board(unit: GameUnit, pos: Vector2i) -> bool:
	if unit == null or not roster.has(unit):
		return false
	if not HexGrid.in_bounds(pos.x, pos.y, HexGrid.ROWS):
		return false
	var occupant := _hex_occupied_by(pos)
	if occupant == unit:
		return true
	# If unit is coming from the bench, respect board capacity.
	if not unit.is_on_board():
		if board_count() >= economy.board_capacity():
			return false
	if occupant != null:
		# Swap: occupant takes unit's previous location.
		if unit.is_on_board():
			occupant.board_pos = unit.board_pos
		else:
			occupant.board_pos = Vector2i(-1, -1)
			occupant.bench_index = unit.bench_index
	unit.board_pos = pos
	unit.bench_index = -1
	roster_changed.emit()
	return true


## Move a unit back to the bench.
func move_to_bench(unit: GameUnit) -> bool:
	if unit == null or not roster.has(unit):
		return false
	if not unit.is_on_board():
		return true
	var idx := _first_free_bench_index()
	if idx < 0:
		return false
	unit.board_pos = Vector2i(-1, -1)
	unit.bench_index = idx
	roster_changed.emit()
	return true


# --- Augments ----------------------------------------------------------------

## If this round is an augment-offer round (and one hasn't been offered yet),
## pick N distinct random augments the player doesn't already own and offer them.
func _maybe_offer_augments() -> void:
	if _augment_offered_round == round_number:
		return
	var acfg: Dictionary = GameDatabase.augments_config
	var offer_rounds: Array = acfg.get("offer_rounds", [])
	if not offer_rounds.has(round_number):
		return
	var n: int = int(acfg.get("choices_per_offer", 3))
	var available: Array = []
	for aug in GameDatabase.all_augments():
		if not augments.has(aug.id):
			available.append(aug.id)
	_rng.shuffle(available)
	pending_augments = []
	for i in mini(n, available.size()):
		pending_augments.append(String(available[i]))
	_augment_offered_round = round_number
	if not pending_augments.is_empty():
		augments_offered.emit(pending_augments)


## Choose one of the pending augments. Applies its effects and clears the offer.
func choose_augment(augment_id: String) -> bool:
	if not pending_augments.has(augment_id):
		return false
	var aug: AugmentDef = GameDatabase.get_augment(augment_id)
	if aug == null:
		return false
	augments.append(augment_id)
	pending_augments = []
	_apply_augment_effects(aug)
	augment_chosen.emit(augment_id)
	return true


func _apply_augment_effects(aug: AugmentDef) -> void:
	if aug.kind != "economy":
		return  # combat effects are applied at combat build via player_combat_mods()
	var e: Dictionary = aug.effects
	economy.bonus_income += int(e.get("income_bonus", 0))
	economy.bonus_interest_cap += int(e.get("interest_cap_bonus", 0))
	economy.bonus_xp_per_round += int(e.get("xp_per_round_bonus", 0))
	var gold_now := int(e.get("gold_now", 0))
	if gold_now > 0:
		economy.add_gold(gold_now)
	var xp_now := int(e.get("xp_now", 0))
	if xp_now > 0:
		economy.add_xp(xp_now)


## Aggregate combat-augment effects into a single global-modifier bundle passed to
## the CombatEngine for the player's team.
func player_combat_mods() -> Dictionary:
	var mods: Dictionary = {}
	for aug_id in augments:
		var aug: AugmentDef = GameDatabase.get_augment(aug_id)
		if aug == null or not aug.is_combat():
			continue
		for key in aug.effects.keys():
			mods[key] = float(mods.get(key, 0.0)) + float(aug.effects[key])
	return mods


# --- Star combine ------------------------------------------------------------

# --- Debug helpers (sandbox/testing only) ------------------------------------

## Add a hero to the bench for free (bypasses gold/pool). Returns false if the
## bench is full. Intended for the in-game debug keys and the sandbox.
func debug_add_unit(hero_id: String) -> bool:
	var hero := GameDatabase.get_hero(hero_id)
	if hero == null:
		return false
	var idx := _first_free_bench_index()
	if idx < 0:
		return false
	var gu := GameUnit.new(_uid, hero, 1)
	_uid += 1
	gu.bench_index = idx
	roster.append(gu)
	_combine(hero.id)
	roster_changed.emit()
	return true


func _combine(hero_id: String) -> void:
	var changed := true
	while changed:
		changed = false
		for star in [1, 2]:
			var matches: Array = roster.filter(
				func(u): return u.hero.id == hero_id and u.star == star)
			if matches.size() >= 3:
				# Prefer keeping a board position (and the highest one, deterministic).
				var keep_pos := Vector2i(-1, -1)
				for m in matches:
					if m.is_on_board():
						keep_pos = m.board_pos
						break
				var consumed: Array = matches.slice(0, 3)
				for c in consumed:
					roster.erase(c)
				var upgraded := GameUnit.new(_uid, GameDatabase.get_hero(hero_id), star + 1)
				_uid += 1
				if keep_pos.x >= 0 and _hex_occupied_by(keep_pos) == null:
					upgraded.board_pos = keep_pos
				else:
					var idx := _first_free_bench_index()
					upgraded.bench_index = idx if idx >= 0 else BENCH_SIZE
				roster.append(upgraded)
				changed = true
				break
