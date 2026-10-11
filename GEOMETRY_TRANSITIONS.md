# Region geometry transitions

The ordinary transition transforms a **finite region with boundary conditions**.
It does not preserve source cells as logical units, their internal adjacency
graph, or their junctions. The number of atoms and their contacts may change.
This specification supersedes the earlier cell-unit interpretation of the research
model. In particular, the former four-unit junction obstruction is not a valid
impossibility certificate for ordinary square-to-hexagon transitions and has been
removed, together with partition enumeration.

## Invariants and region properties

Each original exterior interface retains its identity, color and cyclic position.
A colored interface occupies exactly one destination boundary edge; only a
`null` interface may occupy a nonempty consecutive run of multiple edges. No
interface can disappear, split, reverse order or be introduced. Initially each
exposed source edge is a distinct interface. Equal colors do **not** merge IDs;
`null` remains a jolly (unconstrained) condition on every edge in its expansion.

The destination consists of distinct atomic cells of the selected geometry,
is finite and edge-connected, and has exactly one simple boundary. Holes,
disconnected regions and nonsimple contours are unsupported. No convexity,
visual resemblance, cell correspondence or exact perimeter length is required.

Contours use the existing deterministic leftmost/uppermost start and visually
anticlockwise orientation (canvas y points down). Cyclic verification permits
changing the starting point but not reversal. The deterministic correspondence
assigns one edge to each interface and distributes surplus edges evenly among
the `null` interfaces, preserving cyclic order. A longer target perimeter without
any `null` interface is rejected. Colored sides are never duplicated.

## Area: hard admissibility constraint

Each regular atomic polygon has **circumradius 1**:

```
a_s = s * sin(2*pi/s) / 2
A(R) = n * a_s
n_ideal = A(source) / a_target
delta_A = abs(A(target) - A(source)) / A(source)
delta_A <= epsilon
n_min = max(1, ceil((1-epsilon) * n_ideal))
n_max = floor((1+epsilon) * n_ideal)
```

Epsilon is configurable, not fixed at 50%. The UI accepts 0–10000%, at most two
decimal places; default **30%**. Only complete candidates within this exact
integer interval are generated. Smaller partial sets can be built as construction
prefixes, but are never submitted as candidates. An empty interval is a proved
impossibility **within the selected area tolerance**.

Areas have common denominator `4` and numerators `3*sqrt(3)`, `8`, and
`6*sqrt(3)` for triangles, squares and hexagons. BigInt arithmetic in Q(sqrt(3))
checks interval endpoints, area admissibility and area-error ordering exactly.
Floating-point values are used for initial endpoint estimates and display only;
exact comparisons adjust the estimates before use.

The reference is the **current source region**, not the initial region of an
entire chain of transitions. Individually admissible steps can accumulate drift.
Canvas polygon size is independent of this mathematical normalization.

## Global boundary/internal ratio

```
B = number of exposed atomic sides
I = number of internal adjacent pairs, counted ONCE
s*n = 2*I + B
rho = B / I
```

The target should approximate the source ratio, not maximize its internal contacts.
The previous `Fint/Fext` objective is no longer used. We use symmetric relative
ratio deviation, with an independent hard tolerance tau:

```
delta_rho = abs(rho_target - rho_source) / max(rho_target, rho_source)
delta_rho <= tau
```

For finite positive ratios this equals
`abs(B_target*I_source - B_source*I_target) /
 max(B_target*I_source, B_source*I_target)`.
Numerators and denominators are integers. Thresholds and comparisons use exact
BigInt cross multiplication, including equality at a tolerance boundary.

If `I=0`, rho is **infinite**. The explicit extension is:

- Two infinite ratios: deviation 0.
- Exactly one infinite ratio: deviation 1 (100%).

Thus a singleton may transition to a multi-cell region only at tau=100%, while
singleton-to-singleton transitions have zero ratio deviation. No division by zero
or arbitrary finite surrogate is used. Serialized metrics store `rho: null` for
infinity, and the UI displays ∞. This is a chosen convention, not a theorem about
infinite relative errors.

Tau is editable over **0–100%**, at most two decimal places; default **50%**.
At 100% the ratio filter admits every ratio. Area and boundary constraints still
apply. Tightening tau can reject long strips with excessive boundary/internal
ratio, without forbidding strips or other shapes as a separate invariant.

## Pareto objectives

Only admissible candidates enter the frontier. With geometric preference disabled, both original objectives are minimized:

1. Relative area error delta_A.
2. Symmetric ratio deviation delta_rho.

Dominance requires no worse value on either objective and strict improvement on
at least one. There is no weighted sum. One witness per equal objective pair is
retained when the entire shape feature is disabled. The continuous-field modes below retain multiple geometric representatives. The UI sorts by increasing area error and permits selecting any retained
tradeoff after stopping. This is the frontier **of found candidates**, not a
certified global frontier.

For example, a 2×2 square region can become a four-hexagon rhombus: source B=8,
I=4, rho=2; destination B=14, I=5, rho=2.8. Area deviation is about 29.9038%, ratio
deviation about 28.5714%. It is admissible with epsilon=30%, tau=50%, even though
its internal adjacency structure differs. A 4×4 square source also has witnesses
found by the search within 50% area and 50% ratio tolerances.

## Generator and independent verifier

`transition-search.js` proposes unlabelled lattice cell sets:

- Current-lattice candidates for the same atomic family/orientation changes.
- Nine deterministic growth variants, from compact to elongated, provide
  admissible-size proposals early without enumerating all smaller shapes.
  Their geometric scores affect discovery only, never certification or Pareto.
- Translation-canonical lattice-animal enumeration broadens the candidate set.
  Triangular enumeration starts from both orientations. Internal adjacency
  is used only to build connected destination sets, never to match source cells.

`logical-transition.js` retains its historical filename but exports
`BoundaryTransition`. There is no ordinary logical-unit mode or junction test.
Its independent certificate recomputes the destination region and metrics and
checks the **supplied** edge/interface correspondence, exact coverage, cyclic
order, nonempty consecutive runs, colors, area tolerance and ratio tolerance.
It does not simply regenerate a mapping and assume the submitted one is valid.
The certificate runs again on the main thread before committing a result.

Generator filters avoid certifying regions with too few exterior sides or a
ratio outside tau. These filters do not replace independent verification.
Diagnostic counters distinguish invalid geometry, insufficient boundary capacity,
ratio exclusions and admitted realizations. All generated candidates are within
the area interval, so certified area exclusions normally remain zero; an
out-of-range externally supplied candidate is still rejected by the verifier.

The Worker runs cooperative search slices and is terminated by **Stop** or the
main-thread deadline guard. Changing either tolerance invalidates old results.
Time, memory, coordinate and cell/segment limits are operational constraints,
not additional mathematical shape bounds. Search limits include 20,000 cells or
boundary segments, 20,000 queued forms or remembered candidates, and 200,000
cell entries per shape/signature collection; they do not change the area-derived
admissible interval. Candidate generation is combinatorial, potentially
exponential, and is not claimed to be O(n) or complete.

Statuses are deliberately distinct:

- **Admissible realization:** independently certified; source is unchanged until Apply.
- **Incomplete:** timeout, Stop, exhausted samples or resource limit. An empty
  frontier does not prove impossibility, even when a small enumeration finishes.
- **Not realizable:** currently only a certified empty integer area interval.
  No source adjacency or junction can produce this status.
- **Invalid/unsupported input:** shown separately; no state modification.

## UI, persistence and migration

Draw a closed region and open **Transizione geometrica · regione e bordo**.
Choose destination, epsilon, tau and time. The UI shows normalized areas, ideal
cell count, actual cell count, relative area error, B, I, source/target rho and
ratio deviation. Apply commits one undoable operation, clearing the source board
and replacing the target-family tileset. The destination board must be empty.
Both orientations of a family share its tileset, as elsewhere in the editor.

`board.boundaryModel` saves:

- `interfaces`: ordered distinct IDs and colors;
- `edgeInterfaces`: the interface on each exterior atomic edge;
- `transition`: version 7, shape settings and integral interval, tolerances, metric convention, normalized source/target
  metrics, generation method and incomplete-search provenance.

There are no saved source-cell units or internal contacts. Save/load and Undo/Redo
retain the external identities, including through multiple transitions. Loading
an old `board.logical` is supported: only `graph.boundary` and `edgeInterfaces`
are read. Old `graph.units`, `cellUnits` and `contacts` impose no constraints.
Older expanded colored mappings can still be read; new results enforce one edge
per colored interface. The next Apply writes the new boundary-only format.

If contour/color edits invalidate the saved external mapping, the next search
reports the inconsistency. **Ridefinisci interfacce dal bordo** explicitly makes
each current exterior edge a new interface. This changes boundary identity and
is undoable; it is never performed silently during a transition.

## Independent target tileset and limits

The new atomic witness tileset uses transferred colors on constrained boundary
edges and palette color 0 internally. Wildcard edges choose 0 for this witness
while their boundary condition remains null. Duplicate tuples are removed.
Source tile types are never converted. There is no preservation claim for source
satisfiability, solution count, or uniqueness of generalized-tile decompositions.
The existing triangle orientation convention is unchanged.

The C solvers remain unchanged and square-only. Geometric transitions run in a
browser Worker and support triangular, square and hexagonal regions regardless
of whether a tiling solver is available for the destination.

## Regression coverage

`test_transition_objectives.cjs` covers normalization, exact area intervals and
percent endpoints, B/I, finite and infinite ratio cases, exact deviation ordering,
Pareto dominance and ties. `test_logical_transition.cjs` (historical filename)
covers singleton/three/eight-square strips, 2×2 and 4×4 square-to-hex witnesses,
all directed geometry/orientation pairs, changed cell counts, strict tolerances,
strip rejection, repeated colors and jolly interfaces, corrupted correspondences,
composed transitions, legacy migration, unsupported regions and Worker timeout.

`test_browser.mjs` exercises real Chromium, Worker search, Stop, preview/apply,
both tolerance controls, stale-result protection, Undo/Redo, JSON round-trip,
2×2 and 4×4 hexagonal results and unchanged Wasm solver behavior.


## Continuous geometric reference

`transition-shape.js` represents the source as the **union of the actual atomic
polygons**, with their shared internal edges removed from the distance boundary.
It uses the original floating-point vertices from `cellAt`, not the rounded
`borderPoints` coordinates. A bounding box is only the integration domain; it is
never the source shape. Concavities therefore remain in the reference.

Canvas circumradii are `1/sqrt(2)` for squares, `1/sqrt(3)` for triangles and `1`
for hexagons. Every coordinate is multiplied by `1/canvasCircumradius`.
The resulting polygon areas agree with the existing mathematical areas, including
across families. Each region's geometric area centroid is translated to the
origin. Atoms in a region have equal area, so their centroid average is exactly
the region's area centroid. An anchor is subtracted before averaging to reduce
cancellation for regions far from the canvas origin. There is **no area fitting,
rotation optimization, reflection, principal-axis or skeleton alignment**.
Orientation variants retain their existing Euclidean orientation.

The immutable-in-use source reference is cached privately by source object,
geometry, IDs and bandwidth; search and independent certification reuse this
geometry, not submitted generator scores. Editing the source invalidates the
cache key. The cache uses weak keys and does not retain previous searches.

For a point x in this common Euclidean space:

```
d_s(x) = -distance(x, boundary(source)) inside the source,
         +distance(x, boundary(source)) outside the source
sigma = (p_sigma / 100) * sqrt(A(source))
phi_sigma(x) = clip(1/2 - d_s(x)/(2*sigma), 0, 1)
```

Distance is the minimum Euclidean point-to-segment distance on the **exterior
union boundary**, with polygon membership determined by ray crossing. Internal
tile edges do not contribute. The band extends sigma to either side of the
boundary. `p_sigma` defaults to 10%; it controls spatial softness, independently
of the permitted total error. At `p_sigma=0`, phi is the indicator (boundary
membership is irrelevant to the area integral); there is no division by zero.

The observed geometric error is

```
E_shape = integral over (source symmetric_difference target)
          of min(1, abs(d_s(x))/sigma) dx / A(source).
```

For sigma=0 the integrand is 1, giving symmetric-difference area divided by source
area. Missing interior and added exterior both contribute. Identical geometric
regions have zero error; the implementation recognizes exact translated
same-lattice sets and returns the exact interval [0,0]. Other coincident regions
are measured by the general bounded integral. Increasing bandwidth weakens the
penalty near the source contour. Normalization is by source area, never by a
count of destination tiles. Errors greater than 1 (100%) are valid.

## Shape preference, hard constraint and discovery

Four UI controls independently select geometric preference (default off),
`p_sigma` (default 10%), a hard shape constraint (default off), and maximum error
`p_E` (default 30%). Both percentages accept 0–10000% with two decimal places.
`p_E/100` is the admissibility threshold; it is not a spatial bandwidth.

Either enabled shape mode activates two additional deterministic growth streams.
They place a source reference relative to a seed at either of two source-cell
anchors. Candidate-cell scores approximate the polygon integral of
`1 - 2*phi_sigma`, using three barycentric quadrature points in **every triangle
of a fan covering the cell**, rather than just its center. Each stream caches up
to 40,000 cell scores for its fixed placement. The complete destination is then
centroid-aligned independently for evaluation. This distinction is deliberate:
fixed placements allow reuse during growth but are only discovery heuristics.
All nine previous growth streams and translation-canonical lattice-animal
enumeration remain, interleaved with the two new streams. The field imposes no
convexity or exact-shape invariant, and does not certify any candidate.

With preference enabled, the Pareto objectives are independently
`(delta_A, delta_rho, E_shape)`. There is no weighted sum. Since the shape measure
has uncertainty, a shape dominance claim requires the dominating upper bound to
be no greater than the other lower bound, together with the existing exact area
and ratio comparisons and one strict improvement. Overlapping intervals leave
potential tradeoffs on the frontier. With only the hard constraint enabled,
Pareto dominance still uses the two original objectives, but shape metrics remain
visible and geometric representatives are retained.

When either mode is enabled, distinct translation-canonical sets sharing cell
count and internal-edge count can survive: up to **eight representatives per
(n,I)**, **256 candidates overall**, and **200,000 retained cell entries**.
Selection within a capped group prioritizes the shape interval midpoint; the UI
reports truncation. These are memory-limited representatives, not a complete
Pareto set, and omitted candidates can include valid tradeoffs. With both modes
disabled, the previous discovery order and one-witness-per-objective-pair policy
remain; no integral is evaluated.

The hard constraint requires `E_shape <= p_E/100`. The independent certificate
reconstructs the destination polygons and computes its own integral, ignoring
any `shapeError` supplied by the generator. Apply repeats this check on the main
thread. If the upper bound passes, the candidate is admitted; if the lower bound
exceeds the threshold it is rejected; if the interval straddles the threshold the
certificate is **inconclusive** and the candidate is not admitted. Inconclusive
counts are shown separately from shape exclusions. They never prove
unrealizability. Area and B/I tolerances and every existing boundary/interface
invariant are checked independently and unchanged.

## Numerical integration and limits

Integration adaptively subdivides an enclosing rectangle into four rectangles,
refining the largest remaining integral uncertainty first with a deterministic
heap. For a box centered at c with half-diagonal r, the signed-distance
1-Lipschitz property bounds every distance in the box by `d(c) +/- r`. This
establishes whether each entire box lies inside/outside each region. Boxes wholly
inside both or outside both contribute zero; boxes definitely in the symmetric
difference use bounds on the continuous weight; uncertain membership uses a zero
lower bound and the maximum possible weighted area as upper bound. Summing gives
analytic **spatial integration bounds**, not a statistical sampling confidence
interval. Thin indentations cannot silently disappear between sample centers:
a box whose center is too near a boundary remains uncertain and is refined.

Default preference evaluation requests an interval width of 0.01 (one percentage
point), with at most 2,048 evaluated boxes. Hard certification requests 0.002 with
8,192 boxes. The public numerical routine allows refinement up to 65,536 boxes.
An additional budget limits point/segment evaluations to about eight million per
measurement. A budget may be reached before the requested accuracy: **precision
is a requested width, not a promise**. Returned bounds, box count and `converged`
make this observable. The UI always shows the interval and its midpoint, even
when the requested width was not reached. Zero bandwidth, complex contours and
small sigma can require substantially more work. Large intervals preserve
uncertainty rather than falsely certifying a threshold or Pareto dominance.

Floating-point computations use a spatial guard of `1e-10 * max(1, extent)` and
an additional normalized-integral margin of `1e-9`. The spatial enclosure argument
is analytic, but JavaScript arithmetic and trigonometric coordinates are **not a
formally verified outward-rounded interval library**. These margins address
roundoff in the supported coordinate range; they are not a machine-checked proof
of all IEEE operations. Exact area and B/I predicates retain their existing
BigInt guarantees. Formal floating-point interval certification remains a limit
of the shape implementation; near-threshold approximate equality is never used
as an acceptance shortcut. Exact same-lattice identity handles a zero threshold
without a numerical equality guess.

No global optimality is claimed. Search time limits and the main-thread Worker
termination guard still apply; bounded integrations are synchronous within a
search step, so cooperative time slices can overrun by one measurement. Further
spatial indexing and tighter integration bounds could improve large-region
throughput. The existing geometric topology checks remain the admission gate.

## Shape UI and persistence

The preview uses centroid-aligned normalized polygons. A translucent blue source
underlies the green destination; a blue exterior stroke marks uncovered source
parts. The source overlay uses two SVG paths, independent of source cell count
in DOM nodes, and is rendered only for the selected result. This is the source
region overlay, not an additional rasterization or heatmap used by the metric.

`state.transitionSettings` stores all four shape controls. Changes are undoable;
JSON validation checks types, ranges and precision. Old projects without settings
load with both modes off. Apply records version 7, the controls, the recomputed
shape interval and `centroid-translation-only` alignment in transition provenance.
Apply remains a single undoable region/tileset replacement. Undo/Redo restores
both settings and board provenance. No new internal-adjacency or tileset logical
equivalence claim is introduced.

## Reproducible C-region comparison

Run `node tools/compare-transition-shape.cjs --write` to regenerate
[raw results](docs/continuous-field-comparison.json) and the
[overlaid shapes](docs/continuous-field-comparison.svg). This experiment uses a
13-square C (top and bottom rows of length 5, left connecting column), all-null
external interfaces, hex-flat destination, **30% area tolerance, 50% B/I tolerance,
p_sigma=10%, no hard shape constraint**, and **6,000 generator work units per
run**. The only mode difference is geometric preference. Evaluation of the final
witnesses uses the same tighter 32,768-box budget for both runs. Work units are
generator advances, not equal CPU time; guided search pays for the integral.

| Run | Examined distinct sets | Admitted | Retained | Boundary exclusions | B/I exclusions |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original search | 47 | 24 | 1 | 21 | 2 |
| Continuous preference | 59 | 34 | 23 | 21 | 4 |

| Selected witness | Cells | Area error | B/I deviation | Shape midpoint | Shape interval |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original frontier | 10 | 0.0740% | 2.0408% | 138.46% | [132.80%, 144.11%] |
| Guided, same cell count | 10 | 0.0740% | 41.6667% | 37.12% | [33.92%, 40.33%] |
| Guided, smallest observed shape midpoint | 12 | 19.9112% | 41.6667% | 25.70% | [22.53%, 28.86%] |

The source has B=28, I=12. The original witness becomes a long shape with little
C-shaped overlap. Field-guided witnesses follow the C's opening and arms much
more closely. The ten-cell comparison has identical area, but a different B/I:
its improved geometry is a **tradeoff**, not dominance in every objective. The
best shape witness spends more of the area tolerance. Both runs are incomplete,
no representative cap was hit, and enumeration remains enabled. The saved JSON
also includes machine-dependent timings, all retained cell IDs and every metric;
these timings exclude the subsequent tighter reporting evaluation.

Tests add exact/translated identities in every geometry, actual polygon-area
normalization, elongated and convex replacements of a C, an approximate C versus
a strip **with equal cell count and B/I**, bandwidth changes, the sharp limit,
an analytically known 150% symmetric-difference case, refinement enclosures,
strict/wide/inconclusive thresholds, untrusted generator metrics, multiple Pareto
witnesses and disabled compatibility. Chromium tests cover the actual Worker,
zero-threshold identity, preview, settings and certificate JSON persistence,
invalid saved settings, Undo/Redo and legacy defaults. Existing boundary,
interface-color, solver and transition tests continue to run in CI.
