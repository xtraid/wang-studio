# Region boundary transitions

This operation implements the boundary-preserving construction specified for
*Research on Tiling Complexity*. It transforms a finite connected region and
its boundary conditions, without claiming to preserve tileability.

## Existing representation and integration

The editor stores a board for each geometry in `state.boards[geometry]`.
A board contains `placed`, mapping cell IDs to tile edge tuples, and `borders`,
mapping undirected atomic edge keys to palette indices. A jolly edge has value
`null`; absence of a key means no drawn boundary. Palette indices, rather than
RGB values, identify colors. Two indices with equal RGB values remain distinct.

There is no persistent explicit region object. Cells inside the drawn contour
are reconstructed when a transition is requested. The operation uses **all**
borders on the current board, independently of the rectangular selection tool
and the viewport. Multiple contours are rejected rather than choosing one.
Tiles already placed on the board do not define the region.

`cellAt(id, geometry)` and `lattice(point, geometry)` reuse the editor's existing
polygons and coordinate systems. The optional geometry argument lets planning
inspect another geometry without changing the current state. `transition.js`
contains extraction, construction, validation and the atomic state update.
The solver and its square-only instance contract are unchanged.

## Boundary order

1. Each boundary edge contributes its two endpoints to an incidence map.
2. Every vertex must have degree two, and one traversal must visit all edges.
   Open contours, branches, point contacts, holes and separate components fail.
3. Every drawn edge must be an actual atomic side with two grid-cell owners.
   Atomic edges in these regular grids cannot cross away from grid vertices.
4. The start is the endpoint with smallest x, breaking ties by smallest y,
   using the editor's quantized endpoint coordinates.
5. Traversal is anticlockwise **as seen on the canvas**. Canvas y increases
   downward, so the signed shoelace area is negative. Equivalently, use the
   ordinary mathematical anticlockwise convention after replacing y by -y.

Orientation is established from geometry, never from the colors. Reversing the
initial arbitrary graph walk also reverses each directed edge, retaining the
same starting vertex. No color-dependent normalization, cyclic rotation or
reflection is performed during transfer.

The cell on the interior side of the first oriented edge seeds a flood fill.
The fill crosses shared atomic sides except drawn barriers. Its exposed sides
must coincide exactly with the input boundary. Connectivity, one simple cycle
and the perimeter identity are verified again on the resulting cell set.

## Deterministic target constructions

The square and hexagonal coordinates below are the editor's integer cell IDs.
Hexagons use axial coordinates. A triangular cell ID is `(i,j,h)`, where
`h` is 0 or 1 for the two geometric orientations.

| Target | Cells | Supported perimeter |
| --- | --- | --- |
| Triangle | `(floor(k/2),0,k mod 2)`, for `0 <= k < m-2` | Every integer `m >= 3` |
| Square | `(i,0)`, for `0 <= i < (m-2)/2` | Even `m >= 4` |
| Hexagon, chain | `(i,0)`, for `0 <= i < (m-2)/4` | `m = 4q+2`, `q >= 1` |
| Hexagon, triangle and tail | `(0,0)`, `(1,0)`, `(0,1)`, then `(-i,0)` for `1 <= i <= (m-12)/4` | `m = 12+4q`, `q >= 0` |

The triangle chain alternates the two fixed geometric cell orientations. Each
additional cell shares exactly one side. The square strip has the same property.
Their perimeters are `n+2` and `2n+2`, respectively.

The three initial hexagons are pairwise adjacent around one common vertex:
`n=3`, `a=3`, hence `6n-2a=12`. The tail grows away from the other two hexagons;
each added cell shares one side. The chain family has perimeter `4n+2`, and the
second family has perimeter `4n`. Together they cover 6, 10 and every even
perimeter from 12; perimeter 8 is rejected.

Construction uses actual polygon edge keys to count internal adjacencies and
extract the target boundary. It verifies `m = sn - 2a` and that the target has
exactly the requested number of exposed sides. These checks catch unintended
extra adjacencies instead of relying only on the formulas.

The UI offers canonical triangle (`tri-up`), square and hexagon (`hex-flat`)
targets. Extraction supports all five existing drawing orientations; the
construction code and tests also support `tri-side` and `hex-point`.

## Color transfer and state changes

Given the two ordered boundaries, target edge `i` receives source edge `i`'s
palette index. This preserves the full sequence and the last-to-first adjacency.
The implementation extends the same rule to jolly edges: `null` stays `null` and
is not treated as a color. No palette deduplication occurs.

Planning completes all geometric checks before taking an undo snapshot or
changing editor state. A failure only changes the status message. On success:

- The source board is cleared and the target board receives only the new contour.
- Placed tiles are not transferred. Undo restores them together with the source.
- A different target board must be empty, so an existing composition is not lost.
- Existing target-family tilesets remain unchanged; an absent tileset becomes
  empty. No tiles are synthesized, rotated or converted between side counts.
- The target becomes active and the interface switches to boundary drawing.
- The operation adds one undo entry. Save/load uses the existing board schema.

Existing solver session checks compare their original instance to current state,
so incompatible stale results cannot be applied after changing the region.
The operation makes no assertion about existence or number of target tilings.

## Complexity and numerical limits

Let `n` be the source cell count and `m` its boundary segment count. The core
transition uses expected constant-time JavaScript Map/Set operations:

- Boundary incidence, ordering, geometric side validation and coloring: `O(m)`.
- Interior flood fill and region adjacency validation: `O(n)`.
- Target construction and validation: `O(m)` cells and sides.

Each neighboring-cell lookup examines a fixed lattice neighborhood (at most 18
candidate cells); edge-owner validation examines at most 72 candidates. There
is no scan of a region's bounding rectangle, no sorting of the whole boundary,
and no pairwise intersection scan in the production algorithm. Since `m <= 6n`,
the **core geometric transition** is expected `O(n)` time and memory. This uses
the bounded coordinate/key representation and expected Map/Set costs, not an
unconditional worst-case guarantee for a JavaScript runtime.

The **whole editor action is not claimed to be O(n)**: cloning the project for
planning and undo costs `O(S)` in total saved project size, including other
boards and tilesets. UI rebuilding also depends on visible grid cells, palette,
placed tiles and tileset size. Existing undo history retains up to 80 snapshots.

The implementation limits both explicit regions and contours to 20,000 cells
or segments. Cell lattice coordinates must have absolute value at most 100,000;
boundary coordinates are also bounded to 100,000 world units. Endpoint keys
reuse the editor's rounding to `1e-5` world units. This is not an exact symbolic
geometry representation: failures to establish shared sides are rejected,
never repaired by geometric approximation. Checks run synchronously; large
accepted regions can briefly occupy the UI thread. Large PNG exports remain
subject to the editor's existing image-size limits.

## Tests

`node tests/test_transition.cjs` checks all supported pairs of the five drawing
orientations for `m = 6,8,10,12,14,16,18,20,22,24`, plus smaller odd triangular
cases. Checks include connectivity, simple boundary, exact color sequence,
perimeter identity, successive transformations, offscreen coordinates, empty
target tilesets, undo/redo, serialization and atomic rejection.

An independent convex-polygon separating-axis check verifies that generated
cells have no positive-area overlap. Color words contain repeated colors, a
unique starting marker, equal-RGB/different-index colors and jolly sides; exact
array equality rejects any unwanted rotation or reversal.

The actual Chromium integration test clicks the transition controls, checks a
square → hexagon → triangle → square chain, Undo/Redo, PNG export and occupied
destination rejection, then runs the existing C solver tests.
