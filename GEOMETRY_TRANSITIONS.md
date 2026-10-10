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
  not invariants. Area error and the face ratio are two separate Pareto objectives.
- The target tileset is constructed independently of the source tileset.

## Use in the editor

Draw one closed region and open **Transizione geometrica · unità logiche**.
Choose a target geometry and a search time, then select **Cerca realizzazioni**.
The browser searches in a Worker without changing the project. The candidate
selector contains one representative for each non-dominated objective pair
found. The preview colors identify logical units, not Wang edge colors.

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
this is a frontier of observed objective pairs, not a list of every realization.

Floating-point values are used for display. For comparisons, cell areas have the
common denominator `16*pi^2` and numerators `3*sqrt(3)`, `8`, `6*sqrt(3)`.
Area-error ordering uses exact BigInt arithmetic in `Q(sqrt(3))`; eta is compared
by integer cross multiplication. Rounding cannot change Pareto dominance.

## Candidate search and its limits

Two generators run alongside each other:

- Geometric samples map target cell centers to source units at several scales
  and grid phases. This accelerates discovery and is **not** an invariant or a
  guarantee that a suitable sample exists.
- A lattice-animal enumerator grows finite connected target cell sets, normalized
  only by translation. It tries labelled partitions, pruning impossible contacts.
  Triangular seeds include both fixed cell orientations.

Every candidate from either generator passes the same certificate. Geometry
sampling never authorizes an approximate contact, a color change or relaxed
interface order. A failed sample is discarded without changing the source.
The former fixed-perimeter strip/chain construction remains only as a geometry
regression fixture; it no longer implements the editor's transition command.

The unbounded research space is **not** replaced by an artificial maximum region
size. The browser nevertheless has operational budgets: selectable search time,
20,000 queued lattice forms and the editor's existing 20,000-cell/segment and
coordinate limits. Hitting one reports an incomplete search, not an empty
mathematical realization space. All individual accepted candidates are finite.

The search is combinatorial and can be exponential. The former claim of an
expected linear-time boundary conversion does not apply to this optimization.
The current implementation does not compute a certified global Pareto frontier
or decide every possible transition.

### Distinct outcomes

- **A realization was found:** its incidences, interface order and colors are
  verified. Pareto comparisons refer only to candidates found in this search.
- **Search incomplete/interrupted:** time, memory or an editor resource limit was
  reached. An empty frontier is not proof that no realization exists.
- **Not realizable:** a specific incompatibility certificate was established.
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
Real Chromium tests cover Worker search, timeout/Stop, preview selection, apply,
Undo/Redo, save/load, successive transitions and the unchanged C solvers.
