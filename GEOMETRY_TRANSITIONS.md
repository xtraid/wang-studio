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
It occupies one nonempty consecutive run of destination boundary edges. No
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
assigns boundary edge i to interface `floor(i * interfaceCount / edgeCount)`.
When enough edges exist, this gives each interface a positive consecutive run.

## Area: hard admissibility constraint

The circumcircle of each regular atomic polygon has **circumference 1**:

```
a_s = s * sin(2*pi/s) / (8*pi^2)
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

Areas have common denominator `16*pi^2` and numerators `3*sqrt(3)`, `8`, and
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

Only admissible candidates enter the frontier. Both objectives are minimized:

1. Relative area error delta_A.
2. Symmetric ratio deviation delta_rho.

Dominance requires no worse value on either objective and strict improvement on
at least one. There is no weighted sum. One witness per equal objective pair is
retained. The UI sorts by increasing area error and permits selecting any retained
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
- `transition`: version 4, tolerances, metric convention, normalized source/target
  metrics, generation method and incomplete-search provenance.

There are no saved source-cell units or internal contacts. Save/load and Undo/Redo
retain the external identities, including through multiple transitions. Loading
an old `board.logical` is supported: only `graph.boundary` and `edgeInterfaces`
are read. Old `graph.units`, `cellUnits` and `contacts` impose no constraints.
The next Apply writes the new boundary-only format.

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
