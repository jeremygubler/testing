class_name HexGrid
extends RefCounted

## Hex board model (7 columns x 4 rows per player, TFT-standard).
##
## Coordinate system: "odd-r" offset coordinates (col, row). Rows are horizontal;
## odd rows are shifted half a hex to the right for the classic honeycomb look.
## Internally we convert to axial/cube coordinates for distance & neighbour math.
##
## This class is pure model: it knows geometry and occupancy, NOT rendering.
## Presentation converts (col,row) -> pixel positions separately.

const COLS: int = 7
const ROWS: int = 4  # rows belonging to ONE player's placement zone.

# In a full auto-battle both teams share a mirrored board (8 rows total: 4 + 4).
# The simulation uses a combined field ROWS*2 tall; the front team occupies the
# bottom half, the enemy the top half (mirrored).
const COMBAT_ROWS: int = ROWS * 2  # 8


static func in_bounds(col: int, row: int, rows: int = ROWS) -> bool:
	return col >= 0 and col < COLS and row >= 0 and row < rows


## odd-r offset -> cube coordinates.
static func offset_to_cube(col: int, row: int) -> Vector3i:
	var x: int = col - ((row - (row & 1)) >> 1)
	var z: int = row
	var y: int = -x - z
	return Vector3i(x, y, z)


## Hex distance between two offset coordinates.
static func distance(a: Vector2i, b: Vector2i) -> int:
	var ca: Vector3i = offset_to_cube(a.x, a.y)
	var cb: Vector3i = offset_to_cube(b.x, b.y)
	return (absi(ca.x - cb.x) + absi(ca.y - cb.y) + absi(ca.z - cb.z)) / 2


# Neighbour column/row deltas for odd-r layout (even rows vs odd rows differ).
# static var (not const) so the Vector2i literals are built at first access rather
# than requiring constant-expression folding.
static var _EVEN_ROW_NEIGHBORS: Array[Vector2i] = [
	Vector2i(1, 0), Vector2i(0, -1), Vector2i(-1, -1),
	Vector2i(-1, 0), Vector2i(-1, 1), Vector2i(0, 1),
]
static var _ODD_ROW_NEIGHBORS: Array[Vector2i] = [
	Vector2i(1, 0), Vector2i(1, -1), Vector2i(0, -1),
	Vector2i(-1, 0), Vector2i(0, 1), Vector2i(1, 1),
]


## Returns the up-to-6 in-bounds neighbours of a hex, in a FIXED deterministic
## order (important: combat pathfinding must never depend on iteration randomness).
static func neighbors(col: int, row: int, rows: int = COMBAT_ROWS) -> Array[Vector2i]:
	var deltas: Array[Vector2i] = _ODD_ROW_NEIGHBORS if (row & 1) == 1 else _EVEN_ROW_NEIGHBORS
	var out: Array[Vector2i] = []
	for d in deltas:
		var nc: int = col + d.x
		var nr: int = row + d.y
		if in_bounds(nc, nr, rows):
			out.append(Vector2i(nc, nr))
	return out


## Mirror a placement hex (col,row in 0..ROWS-1) onto the enemy half of the
## combat field so the two teams face each other.
static func mirror_to_enemy(col: int, row: int) -> Vector2i:
	return Vector2i(COLS - 1 - col, COMBAT_ROWS - 1 - row)


## Place a friendly hex into the bottom half of the combat field.
static func to_combat_friendly(col: int, row: int) -> Vector2i:
	# Friendly rows 0..3 map to combat rows 4..7 (bottom).
	return Vector2i(col, row + ROWS)
