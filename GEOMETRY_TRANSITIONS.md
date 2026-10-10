# Logical geometry transitions

This implementation follows section 1.2.4 of **Research on Tiling Complexity**,
`tiling_complexity_con_note.pdf`, downloaded on 10 October 2026. Its SHA-256 is
`1f09803bf47cb14381ccc164c98f5e701652e14e392177df64fac19c8ebd2ea7`.
It replaces the earlier operation that preserved the number of atomic boundary
segments and constructed a strip or chain.

The operational choices confirmed for this version are:

- Initially, each source cell is one logical unit.
- A target unit can occupy several connected atomic cells.
- Every logical interface occupies a positive number of consecutive atomic sides.
- Logical incidences, cyclic interface order and boundary colors are invariants.
- Atomic interface lengths, region area and the internal/external face ratio are
  not exact invariants. Relative area error must satisfy the chosen tolerance;
  area error and the face ratio remain two separate Pareto objectives within it.
- The target tileset is constructed independently of the source tileset.

## Use in the editor

Draw one closed region and open **Transizione geometrica · unità logiche**.
Choose a target geometry, an area tolerance and a search time, then select
**Cerca realizzazioni**. The default tolerance is **30%**, editable before each
search; it is a hard constraint, not a weighted penalty.
The browser searches in a Worker without changing the project. The candidate
selector contains one representative for each non-dominated objective pair
found **within the tolerance**, sorted by increasing area error. The first
result is selected by default; other non-dominated tradeoffs remain available.
Selection is enabled when the search stops, so streaming updates cannot change
a user-selected candidate. The preview colors identify logical units, not Wang
edge colors. The UI shows relative error, normalized source/target areas and eta.

After choosing a candidate, **Applica realizzazione e nuovo tileset** commits
one undoable operation. The source board is cleared; the target must be empty.
The target-family tileset is replaced by a newly constructed atomic tileset.
Placed source tiles are not converted or copied. Other orientations sharing
that target family also use the new family tileset, as in the existing editor.

Dashed blue lines on the board show contacts between logical units. Save/load
retains their partition and interfaces. A subsequent transition uses that same
logical graph, rather than treating every target atom as a new logical unit.
**Ogni cella come unità** explicitly resets the partition when desired.
If editing a contour invalidates its saved partition or colors, the next
transition rejects it and asks for an explicit partition reset.

## Representation and certificate

The existing `state.boards[g]` still contains `placed` and `borders`. The optional
`logical` member records:

- `graph.units`: logical units and their ordered ports, including original cell IDs;
- `graph.boundary`: distinct external interface IDs, owner units and palette indices;
- `cellUnits`: the target partition, mapping every region cell to exactly one unit;
- `edgeInterfaces`: the external logical interface occupying each exposed side;
- `contacts`: grid sides separating different logical units, for display;
- `transition`: normalization, source/target metrics, search method/status and
  the policy used to construct the new tileset.

An interface is identified by its ID, **not by its color**. Adjacent interfaces
with the same color remain distinct. Palette entries with identical RGB values
also remain distinct. Jolly interfaces preserve `null` over their full expansion.

The verifier checks each proposed realization independently of its generator:

1. Cells form a finite connected region with one simple outer boundary.
2. The partition covers it exactly, and every unit is nonempty, connected and
   has one simple boundary in the currently supported representation.
3. Each contact occupies one consecutive run of sides on each incident unit.
4. The cyclic sequence of neighboring units matches the source ports exactly.
   A missing, additional, repeated or reversed contact rejects the candidate.
5. Each external port receives at least one consecutive exposed side. Its palette
   index is copied to all of them. Expansion lengths are balanced deterministically
   within each exterior run; they are not inferred by merging equal colors.
6. The outer cycle visits the original external interface IDs in the same cyclic
   order, without reflection, splitting or additional interfaces.

Unit boundaries are traversed anticlockwise on the canvas, whose y axis points
down. Cyclic comparison permits a different starting point, but never a reversal.
The deterministic geometric start remains the leftmost, then uppermost endpoint.

The explicit source-to-target unit labels provide the isomorphism certificate;
there is no need to guess a graph isomorphism after accepting a candidate.
The certificate is checked again on the main thread before applying the result.
It is also rechecked before using a saved partition for another transition.

## Area and global contact objectives

All mathematical cell areas use a circumcircle of **circumference 1**:

```
a_s = s * sin(2*pi/s) / (8*pi^2)
A(R) = n * a_s
Delta_A = abs(A(source) - A(target))
Fint = 2 * number_of_shared_atomic_sides
Fext = number_of_exposed_atomic_sides
eta = Fint / Fext
```

`Fint` includes every internal atomic contact, including those inside a logical
unit. These quantities are calculated on the **whole region**, not on individual
interfaces. The canvas continues using its existing drawing scale; pixel area
is not the physical normalization used for comparison.

Candidate X dominates Y only when X has no larger area error and no smaller eta,
with at least one strict improvement. There is no weighted sum and no implicit
lexicographic preference. Equal objective pairs retain one representative;
this is a frontier of observed **admissible** objective pairs, not a list of every
realization. Sorting the display by area error does not change Pareto dominance.

The additional hard admissibility condition is:

```
delta_A = abs(A(target) - A(source)) / A(source)
delta_A <= epsilon
```

The UI expresses epsilon as a percentage with up to two decimal places. For a
target cell of normalized area `a_t`, this gives the integer interval:

```
n_min = max(1, ceil(A(source) * (1 - epsilon) / a_t))
n_max = floor(A(source) * (1 + epsilon) / a_t)
```

Here epsilon in the formulas is a fraction (30% = 0.30). Endpoint inclusion is
checked with exact radical arithmetic, rather than trusting floating-point
ceil/floor near equality. The same exact predicate filters candidates and runs
again before applying them. An empty integer interval proves infeasibility
**within this tolerance**, without making a claim about a looser tolerance.

The reference is the **current source region** at each transition, as in the
pairwise definition above. It is not an implicit fixed reference to the first
region of a sequence. Thus several individually admissible transitions can
still accumulate an area drift relative to the initial region. Original lattice
embeddings are tried again as candidates when available, but are subject to the
same current-source tolerance and Pareto comparison.

Each unit with `p` logical ports requires at least
`max(1, ceil((p - 2)/(s - 2)))` target cells: a connected set of `n` cells has
at most `(s-2)*n+2` exposed sides, and every port needs at least one. Summing this
bound across units gives a further necessary lower bound. If it exceeds
`n_max`, the UI reports an explicit area/interface-count certificate.
For example, nine atomic square units require at least eighteen triangles.
Their relative area increase is about **29.9038%**: 30% permits that construction,
whereas 29% cannot. A small tolerance can therefore rule out otherwise valid
transitions for structural reasons.

Floating-point values are used for display. For comparisons, cell areas have the
common denominator `16*pi^2` and numerators `3*sqrt(3)`, `8`, `6*sqrt(3)`.
Area-error ordering uses exact BigInt arithmetic in `Q(sqrt(3))`; eta is compared
by integer cross multiplication. Rounding cannot change Pareto dominance.

## Candidate search and its limits

The previous search used a few raster phases with scales growing up to 12 times
linear size, while the lattice enumerator built all smaller shapes before
reaching useful sizes. Coarse raster samples often lost an interface or added a
contact; the exhaustive prefix spent its budget before reaching a viable shape.
Larger valid samples could remain Pareto-optimal because eta improved despite
their area error. These are separate causes of sparse results and oversized
choices; changing the certificate would not fix them correctly.

The revised generators run cooperatively in the Worker:

- Direct candidates reuse the current lattice for orientation changes, or the
  original unit embedding when returning to its lattice. Square-origin units can
  be constructed as two-triangle rhombi: the square grid maps to a triangular
  lattice parallelogram grid. These candidates still pass the full certificate.
  For initially atomic square units, this construction attains the port-count
  lower bound of two triangles per unit; it does not certify a global eta optimum.
- Raster sampling concentrates scales on the tolerance-derived cell interval
  and tries six phases. Sampling stops when the number of selected atoms exceeds
  the permitted maximum. These are discovery heuristics, not completeness claims.
- The lattice-animal enumerator stops expansion at the permitted maximum size
  and only searches partitions at admissible sizes. Smaller partial shapes are
  still needed to construct larger animals; they are not solution candidates.
  Partition search prunes extra contacts, missing boundary capacity and branches
  with too few unassigned cells left to meet every unit's port-count minimum.
- A local descent tries deleting exposed atoms from a certified candidate when
  doing so strictly improves area error. It stops at the size lower bound and
  rechecks the full interface certificate after each attempted removal. It cannot
  cross invalid intermediate configurations and is not a global minimizer.

All final candidates pass the same certificate. No generator authorizes an
approximate contact, a color change or relaxed interface order. A failed proposal
never changes the source. Direct embeddings which are certified but outside the
area interval are counted separately and never expanded or added to the frontier.
Size-pruned raster proposals have not passed the certificate and are not described
as geometrically valid. Diagnostics distinguish those two exclusion categories
from admissible realizations and search status.

The finite upper cell count follows from the user's tolerance and area
normalization. It is **not** an unrelated artificial region-size objective.
The browser still has operational budgets: selectable search time, 20,000 queued
lattice forms, and the editor's existing 20,000-cell/segment and coordinate limits.
Reaching a resource limit reports an incomplete search, not mathematical
infeasibility. If even the necessary minimum exceeds the editor's capacity, this
is reported immediately as a resource limitation. Timeout and Stop preserve only
the observed admissible frontier, and do not claim infeasibility.

The search is combinatorial and can be exponential. The former claim of an
expected linear-time boundary conversion does not apply to this optimization.
The current implementation does not compute a certified global Pareto frontier
or decide every possible transition.

### Distinct outcomes

- **An admissible realization was found:** its incidences, interface order, colors
  and hard area tolerance are verified. Pareto comparisons refer only to candidates found in this search.
- **Search incomplete/interrupted:** time, memory or an editor resource limit was
  reached. An empty frontier is not proof that no realization exists.
- **Not realizable:** a specific topological incompatibility certificate, empty
  integer area interval or incompatible port-count/area bound was established.
  Area-based certificates refer to the selected tolerance only.
- **Invalid/unsupported input:** no transition is applied, and the input error is
  shown separately.

One recognized incompatibility uses the fixed embedded contact graph. In the
supported disk-unit, simple-region model, an internal face of degree k requires
an internal k-way junction. The triangular, square and hexagonal lattices allow
at most 6, 4 and 3 sectors respectively. Contracting connected disk units and
collapsing consecutive contacts cannot increase this internal face degree.
A larger source internal face therefore cannot be realized without another
contact or external interface, both forbidden here. For example, four squares
in a 2-by-2 block cannot become hexagonal units with that same interface complex.

This certificate is not a general decision algorithm. Holes, non-simple regions,
units with multiple boundary components and arbitrary user-defined initial
partitions are outside the current supported class. No impossibility claim is
made for those unsupported inputs or for the broader research space.

## A new tileset, not a conversion

For an accepted region, the implementation constructs an **atomic witness
tileset** independently of the original tile types:

- Exposed constrained sides take their transferred boundary color.
- All internal sides use palette index 0 as a declared construction convention.
- Jolly sides also choose index 0 for this witness, without constraining the border.
- Each resulting edge tuple is included once in the new tileset.

This gives an explicit atomic assignment satisfying the new boundary and all
internal side equalities under the editor's existing side conventions. It does
not claim to preserve satisfiability, tile identities or solution count of the
source problem. No such property was selected as an invariant.

A logical unit containing multiple atoms is **not** labelled a generalized Wang
tile. Constructing generalized tiles would additionally require verifying their
unique internal decomposition. This version chooses the permitted atomic
realization route and makes no generalized-tile uniqueness claim. Triangle side
numbering retains the editor's existing two-orientation convention; this change
does not resolve the research question about alternative orientation semantics.

The C tiling solvers are unchanged and remain square-only with their existing
limits. A geometric transition can therefore produce a valid region and tileset
that those solver endpoints cannot yet process.

## Files and checks

- `geometry.js`: the same polygon and coordinate functions shared by editor and Worker.
- `transition.js`: existing region and ordered-boundary extraction.
- `logical-transition.js`: interface graphs, certificates, obstruction and new tilesets.
- `transition-objectives.js`: normalized metrics and exact Pareto comparisons.
- `transition-search.js`, `transition-worker.js`: cancellable candidate search.
- `transition-ui.js`: preview, explicit selection, atomic commit and saved partition.

Checks cover area normalization, doubled internal faces, Pareto tradeoffs and
ties, expanded same-color interfaces, connected grouped units, extra contacts,
reversed ports, obstruction proofs, saved partitions and independent tilesets.
Regressions additionally cover exact percentage endpoints, the integer size
interval in all geometry pairs, single-cell sources, the 9-square/18-triangle
case, excluded certified embeddings, sorted filtered Pareto fronts and rejection
without state mutation.
Real Chromium tests cover Worker search, timeout/Stop, preview selection, apply,
Undo/Redo, save/load, successive transitions and the unchanged C solvers.
