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
- Solve square regions with either **C · ottimizzato** or **C · riferimento**.
- Step through solutions, count them, or stop a running search.

**Solving currently supports square regions.** Triangle and hexagon editing
and exports are available; their solver support is still to be implemented.

## Solve your first region

1. [Open Wang Studio](https://xtraid.github.io/wang-studio/).
2. Select **Quadrati** and create your tileset.
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

The solver accepts 1–32 tiles, up to 16 used palette entries, 4096 active cells,
and a bounding rectangle of at most 16384 cells. Unused palette entries do not
count toward the color limit. Tile orientations are fixed; square edges use
`(N,E,S,W)` order.

Search runs in a dedicated browser Worker with a 30-second deadline per active
search segment. Waiting between solutions does not consume that deadline;
a paused session expires after 10 minutes. Stop, timeout or expiry releases
the Worker and retains the last reported lower bound. **Prima** starts again.
Closing the page stops the search; save your project as JSON to keep your work.

## How it connects to Tiling Foundry

Foundry owns the C solvers. Studio consumes their compiled WebAssembly package,
with its version, source revision and checksums pinned in
[`solver.lock.json`](solver.lock.json). Both projects have separate repositories
and deployments. Updating the package brings Foundry's solver improvements
into the editor without maintaining a copy of the C solver source here.

The public app uses GitHub Pages and browser computation, with no paid backend.
Python and Z3 are not required to use it. Project exports record the selected
engine and package provenance; this metadata does not certify a saved solution.

## Planned research features

- Solver support for triangular and hexagonal geometries through explicit
  cell/side adjacency.
- An editor and tilesets for generalized tiles, with verification that their
  atomic tiling problem has exactly one solution for the specified boundary.
- Conversion of region boundaries between geometries, preserving closure and
  adjacency of colored boundary segments. The conversion rules and any shape
  changes will be documented for research discussion.

These features are planned and are not part of the current solver integration.

## Development

For local setup, package updates, tests and the optional native connector, see
[DEVELOPMENT.md](DEVELOPMENT.md). None of those steps is needed to use the
[online editor](https://xtraid.github.io/wang-studio/).
