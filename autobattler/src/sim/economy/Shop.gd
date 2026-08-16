class_name Shop
extends RefCounted

## A player's shop: rolls `size` offers using the level's cost-tier odds, weighted
## within a tier by remaining copies in the shared HeroPool. Deterministic given
## the same RNG stream + pool state.

signal rolled(offers: Array)  # Array[HeroDef|null]

var offers: Array = []          # Array of HeroDef (or null for empty slot)

var _pool: HeroPool
var _rng: DeterministicRng
var _size: int
var _odds: Dictionary


func _init(pool: HeroPool, rng: DeterministicRng) -> void:
	_pool = pool
	_rng = rng
	var shop_cfg: Dictionary = GameDatabase.cfg("shop", {})
	_size = int(shop_cfg.get("size", 5))
	_odds = shop_cfg.get("odds_by_level", {})
	offers.resize(_size)
	offers.fill(null)


func _odds_for_level(level: int) -> PackedFloat32Array:
	var row: Array = _odds.get(str(level), [100, 0, 0, 0, 0])
	var out := PackedFloat32Array()
	for v in row:
		out.append(float(v))
	return out


## Roll a fresh shop for the given player level. Does NOT charge gold (caller does).
func roll(level: int) -> void:
	var odds := _odds_for_level(level)
	var new_offers: Array = []
	for i in _size:
		new_offers.append(_roll_one(odds))
	offers = new_offers
	rolled.emit(offers)


func _roll_one(odds: PackedFloat32Array) -> HeroDef:
	# Zero out the tiers the shared pool can no longer supply, then draw once from
	# what remains — i.e. renormalize over the available tiers.
	#
	# This replaces rejection sampling (draw, skip if exhausted, retry up to 8x).
	# Both converge to the same distribution, but the retry loop could exhaust its
	# attempts and leave the slot empty while stock was still available, and it
	# consumed a variable number of RNG draws per slot. One draw per slot keeps the
	# stream position predictable, which matters for save/replay reasoning.
	var available := PackedFloat32Array()
	for i in odds.size():
		available.append(odds[i] if _pool.copies_left_of_cost(i + 1) > 0 else 0.0)
	var tier_index := _rng.weighted_index(available)  # 0..4 -> cost 1..5
	if tier_index < 0:
		return null  # every tier this level can offer is exhausted
	return _pick_hero_of_cost(tier_index + 1)


func _pick_hero_of_cost(cost: int) -> HeroDef:
	var heroes: Array = GameDatabase.heroes_of_cost(cost)
	var weights := PackedFloat32Array()
	for h in heroes:
		weights.append(float(_pool.copies_left(h.id)))
	var idx := _rng.weighted_index(weights)
	if idx < 0:
		return null
	return heroes[idx]


## Buy the offer at slot `index`: takes a copy from the pool and clears the slot.
## Returns the HeroDef bought, or null if invalid/unavailable.
func buy_slot(index: int) -> HeroDef:
	if index < 0 or index >= offers.size():
		return null
	var hero: HeroDef = offers[index]
	if hero == null:
		return null
	if not _pool.take(hero.id):
		return null
	offers[index] = null
	return hero


## Clear all offers (e.g. after buying, refresh visuals only).
func clear() -> void:
	offers.fill(null)


## Serialize the current offers as hero ids ("" for empty slots).
func offer_ids() -> Array:
	var out: Array = []
	for h in offers:
		out.append(h.id if h != null else "")
	return out


## Restore offers from a list of hero ids ("" -> empty slot).
func set_offers(ids: Array) -> void:
	var arr: Array = []
	for id in ids:
		arr.append(GameDatabase.get_hero(String(id)))  # null for "" / unknown
	offers = arr
	if offers.size() != _size:
		offers.resize(_size)
