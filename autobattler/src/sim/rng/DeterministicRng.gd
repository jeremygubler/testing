class_name DeterministicRng
extends RefCounted

## Deterministic, seedable random number generator (Park-Miller MINSTD LCG).
##
## The ONLY source of randomness allowed inside src/sim/. Never call the global
## randi()/randf() or time-based seeds there, or determinism (and reproducible
## balance tests / replays) breaks.
##
## Why MINSTD and not a bit-twiddling xorshift: in the target Godot runtime,
## bitwise shifts/AND on large operands (intermediate values above ~2^31) did not
## behave like exact 64-bit integer math, which silently broke hand-rolled xorshift
## generators (adjacent seeds collapsed to the same state). MINSTD uses only
## integer multiply + modulo, and every intermediate stays below 2^53
## ((2^31-2) * 16807 ~= 3.6e13), which the runtime handles exactly. That makes the
## stream reproducible on every platform/version — exactly what a deterministic
## sim needs.
##
## Quality note: MINSTD is a classic, modest-quality PRNG. It is entirely adequate
## for shop rolls, combat RNG, and reproducible tests. For a future ranked/netcode
## mode wanting stronger statistical guarantees, vendor a better generator behind
## this same API.

const RNG_VERSION: int = 4  # bump on algorithm changes; used to detect stale caches
const _MOD: int = 2147483647       # 2^31 - 1 (modulus)
const _MULT: int = 16807           # 7^5 (Park-Miller multiplier)
const _MAX: int = 2147483646       # _MOD - 1

var _state: int = 1


func _init(seed_value: int = 0) -> void:
	seed(seed_value)


## Reseed the stream. Same seed -> same sequence, deterministically.
## Maps the seed into [1, 2^31-2] and warms up two steps so adjacent seeds
## diverge before the first public output.
func seed(seed_value: int) -> void:
	var s: int = seed_value % _MAX
	if s < 0:
		s += _MAX
	_state = 1 + s
	_step()
	_step()


## Core LCG step: state = (state * 16807) mod (2^31-1). Product < 2^53.
func _step() -> int:
	_state = (_state * _MULT) % _MOD
	return _state


## Raw positive integer in [1, 2^31-2].
func next_raw() -> int:
	return _step()


## Non-negative integer (alias kept for API compatibility).
func next_u63() -> int:
	return _step()


## Integer in [0, n). n must be > 0.
func randi_below(n: int) -> int:
	assert(n > 0, "randi_below requires n > 0")
	return _step() % n


## Integer in [a, b] inclusive.
func randi_range(a: int, b: int) -> int:
	assert(b >= a)
	return a + (_step() % (b - a + 1))


## Float in [0, 1).
func randf() -> float:
	return float(_step()) / float(_MOD)


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
	return [_state]


func set_state(state: Array) -> void:
	var v: int = int(state[0])
	if v < 1 or v >= _MOD:
		v = 1
	_state = v
