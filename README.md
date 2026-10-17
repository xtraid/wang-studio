# Wang Studio

## [Open the editor in your browser →](https://xtraid.github.io/wang-studio/)

**Open the page and start working. No repository download, installation or account is required.**
The editor and both C solvers run on your device, inside the browser.

Wang Studio is an independent editor for tiling research, connected to
[Tiling Foundry](https://xtraid.github.io/tiling-foundry/) through a versioned
solver package. It provides a space to construct regions and tilesets, set
boundary conditions, and explore their solutions.

## What works today

- Draw square, triangular and hexagonal grids, with five geometry variants.
- Create and edit tilesets and color palettes.
- Draw colored boundaries or use **Bordo jolly** to delimit a region without
  requiring a boundary color.
- Place fixed tiles, select, copy/paste and undo edits.
- Save and load projects as JSON, and export transparent PNG images.
- Solve square, triangular and hexagonal regions with either **C · ottimizzato** or **C · riferimento**.
- Step through solutions, count them, or stop a running search.
- Search for geometric realizations preserving distinct ordered exterior
  interfaces, and compare their normalized area error and global contact ratio.

Both C engines support all five geometry variants, including stepping through
solutions and exact counting.

## Generalized tilesets

The **Atomico** and **Generalizzato** tabs select separate solver inputs.
Atomico uses only ordinary editable tiles. Generalizzato uses only the generated
atoms of enabled generalized tiles in the current geometry. Their atoms are
stored with their parent in the project catalog and shown read-only; they are
not appended to the ordinary editable tileset. No implicit mixed mode is used.

To create a generalized tile, draw a simple closed boundary with no wildcards,
select its entire contour with **Seleziona regione**, open **Generalizzato**, choose
a name and base color, and click **Crea generalizzata dalla selezione**. The outer
colors remain unchanged. Each internal adjacency gets a private color, shared by
its two incident sides, sampled along a continuous shade ramp from the base color.
Already occupied display colors are skipped. Cells are visited by geometric rows,
top to bottom and right to left; within each cell the existing side order is used.
Similar-looking shades still have distinct symbolic IDs, shown in the atom list.

An independent bounded enumeration verifies exactly one tiling of the empty
source region using only that generalized tile's atoms, without fixed placements,
rotations or reflections. An inconclusive check does not save the tile. JSON
imports revalidate the encoding and uniqueness instead of trusting a saved badge.
Uniqueness is individual, not a promise about arbitrary regions or combinations
of several generalized tiles. Identical atomic edge tuples count once.

Creation leaves the current drawing and ordinary tileset unchanged. Mode,
enable/disable, creation and deletion support Undo/Redo and JSON persistence;
older projects default to Atomico with an empty generalized catalog. Switching
mode or changing the active catalog invalidates solver continuation. Remove
foreign fixed tiles from the target region before solving in Generalizzato.

Generalized tiles have no fixed cell-count limit. Existing resource budgets
remain: 100 catalog entries and 65536 palette colors per project. Each internal
adjacency needs a distinct available shade; exhaustion fails without saving a
partial tile. Uniqueness verification retains its 100000-node work budget and
reports an inconclusive result instead of accepting an unverified tile. Solver requests accept runtime-sized active atomic
tilesets and up to 65536 used colors, including boundary constraints. The catalog shows the
active totals; excesses are rejected, never silently truncated. Generated colors
and existing board placements are retained when deleting a catalog entry, to
avoid changing existing drawings. Applying a geometric transition activates its
new atomic tileset by switching to Atomico. Saved generalized tiles and their
unique internal encodings remain unchanged; Undo restores the previous mode too.

## Solve your first region

1. [Open Wang Studio](https://xtraid.github.io/wang-studio/).
2. Select a geometry and create your tileset.
3. Use **Bordi** to draw a closed contour. Choose boundary colors, or use
   **Bordo jolly** for unconstrained boundary sides.
4. Optionally place fixed tiles inside the contour.
5. Select a C engine, click **Prima**, then click a cell inside the region.
6. Use **Successiva** to see another solution or **Conta soluzioni** to count.
   Use **Stop** to interrupt the search.

Displayed solutions can be undone. They do not become additional fixed tiles
for the current enumeration. Editing the instance invalidates continuation;
start a new search after changing its constraints.

### Reading the result

**Almeno N** is a lower bound while enumeration is incomplete.
**Esattamente N** means the search has exhausted all possibilities; an exact
zero means the region cannot be tiled with those constraints. A timeout or
interruption does not mean there is no solution.

Identical tile edge tuples count once, even if the tileset contains duplicate
IDs. Online counts use BigInt and decimal strings to avoid JavaScript number
precision loss. Counting retains a published snapshot, not every solution.

### Current limits

The browser solver accepts runtime-sized tilesets, including more than 32 tiles.
It supports up to 65536 used palette entries and 65536 active cells.
Sparse square regions use active-cell adjacency without a bounding-rectangle cap. Unused palette entries do not
count toward the color limit. Tile orientations are fixed; square edges use
`(N,E,S,W)` order. Triangular and hexagonal edges follow the editor’s polygon
order. The core uses explicit cell/side adjacency for these geometries and
uses domain propagation, MRV, an undo trail and DFS for every geometry.
Inputs within the native limits (32 tiles, 16 colors, 4096 cells) use the
original engines; larger inputs use Foundry’s browser-only dynamic engine for
both selections. Its Wasm memory ceiling is 2 GiB; allocation may fail earlier. The optional native connector retains its existing limits.

Search runs in a dedicated browser Worker with a 30-second deadline per active
search segment. Waiting between solutions does not consume that deadline;
paused sessions have no automatic idle expiry by default. Stop, timeout or expiry releases
the Worker and retains the last reported lower bound. **Prima** starts again.
Closing the page stops the search; save your project as JSON to keep your work.

## Transition between geometries

Draw one closed region, then open **Transizione geometrica · regione e bordo**.
Choose the destination, area tolerance (default 30%), independent B/I deviation
tolerance (default 50%) and search time. Click **Cerca realizzazioni**.

Transitions preserve the identity, color and cyclic order of exterior interfaces.
Each colored interface keeps its current number of atomic sides; only unconstrained (jolly)
interfaces may expand over multiple consecutive sides. **Consenti espansione dei bordi jolly**
is enabled by default. When disabled, both the total number of exterior sides `B`
and the current length of every interface must stay unchanged. When enabled,
`B` may increase, with additional sides assigned only to existing jolly interfaces;
already expanded runs can never contract. Without jollies, `B` stays unchanged
in either mode. This counts atomic sides, not Euclidean perimeter length.
The option is saved in JSON (older projects default to enabled), supports Undo/Redo,
and changing it stops the search and invalidates its results. Internal cell counts and
adjacencies can change. Equal-colored interfaces remain distinct and jolly
interfaces remain unconstrained.

Choose from the observed **Pareto frontier**, minimizing relative area error and
deviation from the source boundary/internal ratio `rho = B/I`. Internal adjacent
pairs are counted once. Ratio deviation is `abs(rho_target-rho_source) /
max(rho_target,rho_source)`. Two infinite ratios have zero deviation; one infinite
and one finite ratio have 100% deviation. Both tolerances are hard constraints.
Results are sorted by increasing area error, with other tradeoffs selectable.

**Applica realizzazione e nuovo tileset** constructs an independent atomic tileset,
clears the source board and replaces the target-family tileset. The destination
must be empty. **Undo** restores the previous project, including tilesets.
Saved projects retain external interface IDs for subsequent transitions; old
cell-unit projects contribute only their boundary mapping. After editing a saved
contour, **Ridefinisci interfacce dal bordo** explicitly resets its interfaces.

Timeout or Stop means **incomplete**, not impossible. The current impossibility
certificate is an empty area-derived integer cell interval. No source-cell
junction or internal adjacency is preserved. Holes and nonsimple boundaries
remain unsupported; the found frontier is not certified globally optimal.

Satisfiability and solution count are not preserved. The constructed tileset is
atomic, with no generalized-tile uniqueness claim. See
[GEOMETRY_TRANSITIONS.md](GEOMETRY_TRANSITIONS.md) for the exact conventions,
independent certificate, persistence and search limits.

## How it connects to Tiling Foundry

Foundry owns the C solvers. Studio consumes their compiled WebAssembly package,
with its version, source revision and checksums pinned in
[`solver.lock.json`](solver.lock.json). Both projects have separate repositories
and deployments. Updating the package brings Foundry's solver improvements
into the editor without maintaining a copy of the C solver source here.

The public app uses GitHub Pages and browser computation, with no paid backend.
Python and Z3 are not required to use it. Project exports record the selected
engine and package provenance; this metadata does not certify a saved solution.

## Development

For local setup, package updates, tests and the optional native connector, see
[DEVELOPMENT.md](DEVELOPMENT.md). None of those steps is needed to use the
[online editor](https://xtraid.github.io/wang-studio/).
