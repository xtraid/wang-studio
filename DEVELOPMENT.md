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
The Python code in this connector validates input and manages native C jobs;
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

