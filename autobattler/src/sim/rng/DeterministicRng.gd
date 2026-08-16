class_name DeterministicRng
extends RefCounted

## Deterministic, seedable random number generator (xorshift32).
##
## The ONLY source of randomness allowed inside src/sim/. Never call the global
## randi()/randf() or time-based seeds there, or determinism (and reproducible
## balance tests / replays) breaks.
##
## Why a hand-rolled xorshift32 rather than Godot's RandomNumberGenerator or a
## 64-bit generator:
##  * Godot's RandomNumberGenerator did not give reproducible same-seed sequences
##    across freshly constructed instances in our headless CI, so we don't depend
##    on its state-reset semantics.
##  * A 64-bit xorshift needs clean two's-complement overflow + logical shifts,
##    which GDScript's signed ints don't reliably provide.
## xorshift32 keeps every intermediate value in the positive < 2^53 range
## (x << 13 of a 32-bit value is at most ~2^45), so there is no integer overflow
## and no sign-extension on right shifts. That makes it identical on every
## platform and Godot version — exactly what a deterministic sim needs.

const _MASK32: int = 0xFFFFFFFF
const _NONZERO: int = 0x9E3779B9  # fallback state (never allow zero)

var _state: int = _NONZERO


func _init(seed_value: int = 0) -> void:
	seed(seed_value)


## Reseed the stream. Same seed -> same sequence, deterministically.
## We mix the seed with a couple of xorshift-style rounds (shifts + XOR only,
## NO multiplication — GDScript's int multiply proved unreliable in the runtime)
## so that adjacent seeds diverge from the first output, then warm up a few steps.
func seed(seed_value: int) -> void:
	var s: int = seed_value & _MASK32
	# Shift/XOR avalanche (no multiply). Constants chosen for good bit diffusion.
	s = (s ^ 0x9E3779B9) & _MASK32
	s = (s ^ (s << 13)) & _MASK32
	s = s ^ (s >> 7)
	s = (s ^ (s << 17)) & _MASK32
	_state = s if s != 0 else _NONZERO
	# Warm up so nearby seeds are fully decorrelated by the first public output.
	_next32()
	_next32()


## Core step: advance the state and return a 32-bit value (1 .. 2^32-1).
func _next32() -> int:
	var x: int = _state
	x = (x ^ (x << 13)) & _MASK32
	x = x ^ (x >> 17)              # x is a masked non-negative int -> logical shift
	x = (x ^ (x << 5)) & _MASK32
	_state = x
	return x


## Raw non-negative 32-bit integer.
func next_raw() -> int:
	return _next32()


## Non-negative integer (alias kept for API compatibility).
func next_u63() -> int:
	return _next32()


## Integer in [0, n). n must be > 0.
func randi_below(n: int) -> int:
	assert(n > 0, "randi_below requires n > 0")
	return _next32() % n


## Integer in [a, b] inclusive.
func randi_range(a: int, b: int) -> int:
	assert(b >= a)
	return a + (_next32() % (b - a + 1))


## Float in [0, 1).
func randf() -> float:
	return float(_next32()) / 4294967296.0  # 2^32


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
	_state = int(state[0]) & _MASK32
	if _state == 0:
		_state = _NONZERO
