class_name DeterministicRng
extends RefCounted

## Deterministic, seedable random number generator.
##
## Backed by Godot's built-in RandomNumberGenerator (PCG32), which is fully
## deterministic for a given seed and identical across platforms for a given Godot
## version. This is the ONLY source of randomness allowed inside src/sim/ — never
## call the global randi()/randf() or time-based seeds there, or determinism (and
## reproducible balance tests / replays) breaks.
##
## We deliberately do NOT hand-roll a 64-bit bit-twiddling PRNG here: GDScript only
## has signed 64-bit ints with implementation-defined overflow behaviour, which
## makes hand-rolled xorshift/splitmix math unreliable. PCG32 via
## RandomNumberGenerator is battle-tested and reproducible.
##
## NOTE for a future networked/ranked mode: if you need a stream that is guaranteed
## stable across Godot *versions* (not just platforms), pin a vendored PRNG here.
## The rest of the game only depends on this class's API, so that swap is local.

var _rng := RandomNumberGenerator.new()


func _init(seed_value: int = 0) -> void:
	seed(seed_value)


## Reseed the stream. Same seed -> same sequence, deterministically.
func seed(seed_value: int) -> void:
	_rng.seed = seed_value
	# Reset the PCG state so the sequence restarts from the seed.
	_rng.state = _rng.seed


## Raw non-negative 32-bit integer (0 .. 2^32-1).
func next_raw() -> int:
	return _rng.randi()


## Non-negative integer (alias kept for API compatibility).
func next_u63() -> int:
	return _rng.randi()


## Integer in [0, n). n must be > 0.
func randi_below(n: int) -> int:
	assert(n > 0, "randi_below requires n > 0")
	return _rng.randi_range(0, n - 1)


## Integer in [a, b] inclusive.
func randi_range(a: int, b: int) -> int:
	assert(b >= a)
	return _rng.randi_range(a, b)


## Float in [0, 1).
func randf() -> float:
	# randf() returns [0, 1]; clamp the (vanishingly rare) 1.0 to keep [0, 1).
	var v := _rng.randf()
	return v if v < 1.0 else 0.0


## Float in [a, b).
func randf_range(a: float, b: float) -> float:
	return a + (b - a) * randf()


## Returns true with probability p (0..1).
func chance(p: float) -> bool:
	return randf() < p


## Weighted pick: returns an index into `weights` proportional to weight.
## Returns -1 if all weights are zero.
func weighted_index(weights: PackedFloat32Array) -> int:
	var total: float = 0.0
	for w in weights:
		total += w
	if total <= 0.0:
		return -1
	var roll: float = randf() * total
	var acc: float = 0.0
	for i in weights.size():
		acc += weights[i]
		if roll < acc:
			return i
	return weights.size() - 1


## In-place Fisher-Yates shuffle of an Array using this stream (deterministic).
func shuffle(arr: Array) -> void:
	for i in range(arr.size() - 1, 0, -1):
		var j: int = randi_below(i + 1)
		var tmp = arr[i]
		arr[i] = arr[j]
		arr[j] = tmp


## Snapshot the internal state (for save/replay).
func get_state() -> Array[int]:
	return [_rng.seed, _rng.state]


func set_state(state: Array) -> void:
	_rng.seed = state[0]
	_rng.state = state[1]
