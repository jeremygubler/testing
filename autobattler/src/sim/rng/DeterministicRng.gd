class_name DeterministicRng
extends RefCounted

## Deterministic, seedable random number generator.
##
## Uses a hand-rolled xorshift128+ so results are IDENTICAL across platforms and
## Godot versions (Godot's built-in RandomNumberGenerator is seedable but we want
## a self-contained, audited stream that never changes underneath us). This is the
## ONLY source of randomness allowed inside src/sim/. Never call randi()/randf()
## or Time-based seeds in the simulation — that would break determinism, replays,
## and future server-side ranked validation.

var _s0: int = 0
var _s1: int = 0

const _MASK64: int = -1  # GDScript ints are 64-bit; -1 == all bits set for &-masking.


func _init(seed_value: int = 0) -> void:
	seed(seed_value)


## Reseed the stream. Same seed -> same sequence, forever.
func seed(seed_value: int) -> void:
	# splitmix64 to expand a single seed into two non-zero state words.
	var z: int = seed_value + -7046029254386353131  # 0x9E3779B97F4A7C15
	z = (z ^ (z >> 30)) * -4658895280553007687      # 0xBF58476D1CE4E5B9
	z = (z ^ (z >> 27)) * -7723592293110705685      # 0x94D049BB133111EB
	_s0 = z ^ (z >> 31)
	z = _s0 + -7046029254386353131
	z = (z ^ (z >> 30)) * -4658895280553007687
	z = (z ^ (z >> 27)) * -7723592293110705685
	_s1 = z ^ (z >> 31)
	if _s0 == 0 and _s1 == 0:
		_s0 = -1  # never allow all-zero state


## Raw 64-bit step (xorshift128+).
func next_raw() -> int:
	var x: int = _s0
	var y: int = _s1
	_s0 = y
	x ^= x << 23
	x ^= x >> 17
	x ^= y ^ (y >> 26)
	_s1 = x
	return (x + y)


## Non-negative 63-bit integer.
func next_u63() -> int:
	return next_raw() & 0x7FFFFFFFFFFFFFFF


## Integer in [0, n). n must be > 0.
func randi_below(n: int) -> int:
	assert(n > 0, "randi_below requires n > 0")
	return next_u63() % n


## Integer in [a, b] inclusive.
func randi_range(a: int, b: int) -> int:
	assert(b >= a)
	return a + randi_below(b - a + 1)


## Float in [0, 1).
func randf() -> float:
	# 53 bits of mantissa precision.
	return float(next_raw() & 0x1FFFFFFFFFFFFF) / float(0x20000000000000)


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


## In-place Fisher-Yates shuffle of an Array using this stream.
func shuffle(arr: Array) -> void:
	for i in range(arr.size() - 1, 0, -1):
		var j: int = randi_below(i + 1)
		var tmp = arr[i]
		arr[i] = arr[j]
		arr[j] = tmp


## Snapshot the internal state (for save/replay).
func get_state() -> Array[int]:
	return [_s0, _s1]


func set_state(state: Array) -> void:
	_s0 = state[0]
	_s1 = state[1]
