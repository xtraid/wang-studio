# Developing Wang Studio

To use the editor, [open the public app](https://xtraid.github.io/wang-studio/).
The instructions below are for working on the code or comparing native solvers.

## Serve locally

The static app lives in `dist/`; it needs no bundler or npm dependencies.
From this repository, run:

```sh
python -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Open <http://127.0.0.1:8765/>. This uses the same WebAssembly package as the public
app. Python only serves files here; any static HTTP server works.

## Deployment

The public app is deployed from `dist/` by `.github/workflows/pages.yml`.
The workflow verifies the pinned package and runs editor and Chromium checks
before publishing to GitHub Pages. Pages uses the GitHub Actions source.
Project-relative paths work without special isolation headers.

## Update the solver dependency

Build a package in Foundry, or download a versioned release, then install it:

```sh
python tools/solver_package.py install /path/to/tiling-foundry-solver-web-VERSION.tar.gz --sha256 EXPECTED_SHA256
python tools/solver_package.py verify
```

The installer also accepts an HTTPS release URL, with mandatory `--sha256`.
It validates the archive, API version and individual files before replacement.
Commit the updated runtime directory and lock together. Future builds of the
Foundry package carry engine changes into Studio without copying C source.


## Optional native comparison

Requirements: Linux, Python 3.11+, `make`, a C17 compiler, and the sibling
Tiling Foundry checkout with the runtime-tileset API described below.
No npm installation, Z3, account or external service is needed for this optional native path.

```sh
cd ~/Projects/wang-studio
python server.py --foundry ~/tiling-foundry
```

Open <http://127.0.0.1:8765/>. The server binds only to loopback. It builds
Foundry's shared library and this project's thin C ABI bridge. Override the
Foundry checkout with `--foundry` or `TILING_FOUNDRY_ROOT`; override the port
with `--port`. `--build-only` builds without starting a server, and
`--no-build` reuses the existing native build.

Open `http://127.0.0.1:8765/?solver=native` to explicitly use the older local
optimized C connector. The default URL uses WebAssembly even with this server.
This optional native HTTP connector remains square-only; use the default browser
mode for triangles and hexagons. The Python code in this connector validates input and manages native C jobs;
it does not run the Python/Z3 solver. The historical `.openai/hosting.json`
identifies an earlier Site and is not the current deployment configuration.


## Ownership and integration

- **Foundry:** native propagation, optimized search, verification and tests.
- **Foundry's browser package:** C reference/optimized entry points, input
  validation, Worker lifecycle, versioned build and distribution.
- **Studio:** editing, closed-region extraction, instance validation, local
  job lifecycle, independent result checking and presentation.
- `backend/optimized_bridge.c` marshals arrays and calls
  `wang_solve_optimized_tileset`. It contains no search implementation.
- `backend/native_solver.py` validates the request, maps palette entries to
  compact native color IDs, sets initial domains, and checks the returned
  solution independently. It does not import Z3 or the Yang–Zhang pipeline.
- `server.py` serves the interface and manages cancellable worker processes.
- `dist/solver.js` detects the selected closed region and uses the browser
  package, or the local API when explicitly selected. The usual editor remains
  usable during search.

Foundry base at integration: `f1c661b11d5471203b460da1f5a9b755c6091774`.
The additional runtime-tileset APIs and the browser package are published
in Foundry’s `solver-web-v0.1.0` release; the original base commit alone does
not contain them. The canonical 23-tile entry points retain their signatures and semantics.
Enumeration uses `wang_enumerate_optimized_tileset` in that same core; it
continues DFS rollback after each verified solution. The one-solution shortcut
for isolated cells is disabled for enumeration. The existing optimized core is
shared, including bytewise support, queue
deduplication, MRV indexing, dynamic DFS and trail optimizations.


## Checks

```sh
python tools/solver_package.py verify
node tests/test_editor.cjs
node tests/test_transition.cjs
node tests/test_transition_objectives.cjs
node tests/test_transition_shape.cjs
node tests/test_logical_transition.cjs
node tests/test_generalized.cjs
node tests/test_browser.mjs
# Run the same checks against the deployed site:
node tests/test_browser.mjs https://xtraid.github.io/wang-studio/
```

The real browser test uses Chromium (`CHROMIUM=google-chrome` is also accepted),
a plain static server under `/studio/`, and no npm dependencies. It checks both
C engines, original constraints, stepping, exact counts, Stop, timeout, stale
results, project provenance and PNG transparency, with no native API calls.

For the optional native connector:

```sh
python server.py --build-only
python -m unittest discover -s tests -v
make -C ~/tiling-foundry c-check
```

Studio includes differential tests against exhaustive enumeration on 100
small instances, plus fixed-tile, 32-tile, hole, validation and job-lifecycle
checks. Enumeration is separately compared with exhaustive solution sets on
100 small instances, and tested on duplicate/isolated/disconnected cells,
32-tile domains, known closed-region counts, stop, timeout and native process
continuation. Foundry adds runtime-tileset and enumeration C regression tests. Browser checks cover
interactive selection and the real local optimized integration.


## Local API

- `GET /api/capabilities`: engine ID `optimized` and current limits.
- `POST /api/solve`: `{geometry, palette, tiles, cells, timeout_seconds}`;
  each cell has `id: "x,y"`, `required: [N,E,S,W]` with `null` unconstrained,
  and optional `fixed: [N,E,S,W]`. Returns a job ID.
- `GET /api/jobs/<id>`: running or terminal result. SAT includes tile-index
  assignments, elapsed solver time and native search metrics.
- `POST /api/enumerate`: the same instance plus `enumeration_mode: "step"`
  (default) or `"count"`. Returns an incremental job ID.
- `POST /api/jobs/<id>/resume`: `{action: "next"}` or `{action: "count"}`;
  resumes a paused enumeration. A generation number prevents stale pause
  responses from being confused with the next solution.
- `GET /api/jobs/<id>` for enumeration includes `count` (decimal string),
  `exact`, and status `running`, `paused`, `complete`, `timeout`, `cancelled`,
  `expired`, or `error`. Only exhaustive `complete` makes the count exact.
- `DELETE /api/jobs/<id>`: cancel the native process; enumeration retains
  its last published lower bound.


### Geometry-neutral enumeration

Foundry's `wang_enumerate_graph` feeds explicit reciprocal cell/side adjacency
into the existing C search core. Studio extracts regions using shared polygon
edges; the browser package independently derives lattice adjacency and validates
published assignments. Both reference and optimized engines support `tri-up`,
`tri-side`, `hex-flat` and `hex-point`, with the same Worker lifecycle as squares.
The package's graph input uses dense active cells (65536 maximum) and does not
allocate a coordinate bounding rectangle. The square API remains compatible.


### Runtime-sized browser tilesets and colors (solver-web 0.3.0)

The public JavaScript API remains version 1; the matched Worker/Wasm pair uses
private ABI 3. Domains contain `ceil(tile_count / 32)` words per cell. Wide color
arrays use 32-bit IDs and a separate unconstrained boundary sentinel. The editor
passes edge arrays and consumes capabilities supplied by the installed package.
Native Reference, Optimized and OpenMP APIs remain unchanged.

Studio pins the published release built from clean Foundry commit
`cb56814760f78ee59e76e41ebfb61e3287237372`. Reinstall it independently:

```sh
python tools/solver_package.py install https://github.com/xtraid/tiling-foundry/releases/download/solver-web-v0.3.0/tiling-foundry-solver-web-0.3.0.tar.gz --sha256 10043becfd404944575808b092400085d12767f3159d0a3f77b9ec88898d8ad6
python tools/solver_package.py verify
```

The lock pins the HTTPS release URL, archive SHA-256 and manifest SHA-256.
The manifest pins all runtime file hashes, source revision and build flags.
Foundry's two local clean rebuilds and GitHub's independent release build
produced identical archives using Emscripten 4.0.23.

Browser tests cover actual controls, JSON file handlers, high-ID rendering,
23/32/33/64/65 tiles and 257 tiles/colors in all five geometries, both engine
selections, adjacent SAT/UNSAT, capability budgets, generalized catalogs,
pause/resume, explicit idle expiry, timeout, Stop and stale-result rejection.
The harness rejects console errors and any native API request, both on a local
static subpath and when given the public Pages URL.

Remaining budgets: 65536 active cells, 65536 palette/used colors, up to 2 GiB
Wasm memory, and Studio's 30-second active search segment. The package default
is 600 seconds; Studio supplies its own timeout. Pause has no default expiry.
The editor retains its separate 5 MB import budget and 100 catalog entries;
generalized pieces have no fixed cell-count limit. Those are editor/uniqueness budgets, not solver
tileset limits. The optional native connector retains its original restrictions.
Large inputs use the same dynamic browser engine for both selections; they do
not claim the specialized native optimized performance.


### Generalized pieces without a cell-count cap

Creation and imported-item validation use uncapped region extraction; the
transition tools retain their existing 20000-cell/segment budgets. Coordinate
validation, simple connected contours, boundary colors, exclusive internal
colors and deterministic cell ordering are unchanged. Preview bounds use an
iterative reduction rather than spreading all vertices into function arguments.

Independent uniqueness verification indexes edge colors, prunes unsupported
root domains and enumerates with explicit DFS frames. It neither fixes cells
to the generated witness nor treats resource exhaustion as UNSAT or uniqueness.
The existing 100000-node work budget remains. Interior domains share the tileset
until pruning, avoiding an unconditional cells-times-tiles allocation.

Compilation/validation do not mutate the project. Creation and import prepare
undo history before switching state and roll back state/history if rendering
throws. Recoverable allocation errors are reported explicitly; export failures
leave the project intact. A browser process killed by the OS or a fatal engine
OOM cannot be caught by JavaScript; unsaved work still depends on browser memory.

Effective limits remain available memory, available distinct RGB shades on the
selected color ramp, the 65536-entry palette, the uniqueness work budget,
100 catalog entries and 5 MB JSON imports. Color-ramp exhaustion may happen well
before the palette is full, depending on base color and previously used colors.
The unchanged Wasm 0.3.0 dependency additionally limits a solve to 65536 active
cells, its linear-memory ceiling and the configured search deadline.

Tests cover 33/65/257 cells in all five geometries, a 20001-cell traversal,
an independent exhaustive oracle for 200 small uniqueness instances, UI
creation, Undo/Redo, real JSON export/import and Wasm solving of individual
65-cell pieces in all geometries plus a 257-cell square piece. Allocation,
color exhaustion, malformed import and rendering faults verify atomic failure.
