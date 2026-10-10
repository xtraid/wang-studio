# Wang Studio

Wang Studio is an **independent editor for research following Tiling Foundry**,
with its own repository and website. It consumes a versioned solver package
produced by Foundry. Foundry's Pages link to Studio; the projects do not share
a repository or a deployment. Studio constructs instances and explores their
solutions interactively.

The current editor lives in `dist/` (hand-authored static source, no bundler).
It includes square, hexagonal and triangular grids, editable tilesets, colored
region boundaries, selection/copy/paste, and transparent PNG exports.

## Run in the browser

The default solver runs entirely in a browser Worker using Foundry's compiled
C engines. Select **C · ottimizzato** or **C · riferimento** in the toolbar.
No Python solver, Z3, account, server-side computation or npm install is needed.
The first browser package supports square solving; all five drawing geometries
remain available. The other solver geometries are planned, not implemented.

The installed runtime is in `dist/vendor/foundry/`, with its provenance and
SHA-256 recorded in `solver.lock.json`. These are generated package artifacts,
not a fork of the solver source. To serve the site locally:

```sh
python -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Open <http://127.0.0.1:8765/>. Python here only serves static files; any static
HTTP server works. Closing the page stops its searches. Project JSON exports
retain the last solver's version, source fingerprint and build information;
this metadata is provenance, not proof that a saved board is a verified solution.

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

## Free hosting

The independent public repository can publish `dist/` through its own GitHub
Pages. Enable **Settings → Pages → Source: GitHub Actions**. The workflow
`.github/workflows/pages.yml` checks package integrity and runs editor and real
Chromium tests before deploying. Paths work under a project URL such as
`https://xtraid.github.io/wang-studio/`; no special isolation headers are needed.
Standard runners and a short artifact retention are used. There is no paid
compute dependency or custom domain requirement.

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
The Python code in this connector validates input and manages native C jobs;
it does not run the Python/Z3 solver. The historical `.openai/hosting.json`
identifies an earlier Site and is not the current deployment configuration.

## Solve a region

1. Select **Quadrati** and create the desired tileset.
2. Draw a closed contour using **Bordi**, choosing its edge colors.
3. Optionally place fixed tiles inside the contour.
4. Click **Prima**, then a cell inside the region.
5. A verified solution fills the region in one undoable operation.
6. **Successiva** resumes the selected C engine's DFS/trail without restarting.
7. **Conta soluzioni** continues enumeration to exhaustion or interruption.

The interface shows **Almeno N** until enumeration has actually exhausted the
search, then **Esattamente N** (including zero for UNSAT). Identical edge tuples
are counted once, rather than once per duplicate tile ID. Counts use Python
integers and JSON decimal strings, avoiding JavaScript integer precision loss.
Counting retains only a published snapshot, not every solution.

The original region, tileset and fixed tiles are retained for the enumeration
session. Displaying a solution does not turn it into a new set of fixed tiles.
**Prima** restarts that original instance when it is still current. Editing the
instance invalidates continuation; stale results are not applied. Each displayed
solution can be undone normally.

A paused callback retains the DFS stack and trail. **Successiva** or
**Conta** resumes it. Waiting between solutions does not consume the 30-second
search deadline; an idle paused session expires after 10 minutes. Stop, timeout
or expiry releases the Worker (or native process) and preserves the last reported lower
bound. Restart with Prima to begin again after those events.

The first integration supports **1–32 tiles, 16 used palette entries,
4096 active cells, and a bounding rectangle of at most 16384 cells**. Unused
palette entries do not count toward the solver's color limit. Duplicate tiles
are allowed; tile orientations are fixed. Square tile edges are `(N,E,S,W)`.

Search runs in a dedicated browser Worker, or an optional native worker process.
**Stop** terminates it;
the current deadline is 30 seconds per active search segment. `UNSAT`, `timeout`, `cancelled`, and
`error` are distinct outcomes. A timeout is never reported as UNSAT. If the
instance changes while solving, the result is discarded rather than applied
to a different instance. Existing placed tiles are constraints, not hints.

Hexagon/triangle editing and exports remain available. Their solver connector
is not implemented yet: the next step is explicit cell/side adjacency in
Foundry, not a reinterpretation of square-grid results.

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

## Next work

Generalize Foundry's square neighbor lookup to explicit side adjacency for
hexagons and triangles; then expose the same optimized endpoint for all five
geometries. Wider domains and a larger color space are separate extensions.

### Bordi jolly

Il pulsante **Bordo jolly** attiva il disegno di contorni che delimitano una regione senza imporre un colore. Sono riconoscibili dal tratteggio bianco su fondo scuro; scegliendo un colore dalla palette si torna ai bordi colorati. Ricliccare un bordo dello stesso tipo lo rimuove. Funzionano nelle cinque geometrie, con copia/incolla, salvataggio e PNG trasparente. Il solver quadrato e il conteggio riconoscono i contorni jolly; le tessere adiacenti continuano a rispettare la regola Wang. Nel JSON un bordo jolly ha valore `null`, distinto da un lato senza bordo.
