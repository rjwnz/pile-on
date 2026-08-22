# Pile-On — Problem Analysis & Project Plan

Research notes prepared 2026-08-22, before any code is written.
Scope: loading steel screw piles onto flat-deck trucks/trailers for NZ road transport,
optimising truck count and producing a visually checkable loading plan for quoting.

---

## 1. What kind of problem is this, really?

The instinct is "3D bin packing". That is the wrong altitude, and starting there will cost
you months. The geometry has a special structure that collapses the problem dramatically:

**Every pile is a long slender cylinder loaded lengthwise, on a flat deck, in discrete tiers
separated by dunnage.**

That gives a clean three-level decomposition:

| Level | Dimension | Problem class |
|---|---|---|
| **Z — tiers** | vertical | small discrete choice (typically 2–5 tiers). Tier height = max pile OD in that tier + dunnage. |
| **Y — lanes** | across deck | 1D packing across a 2.55 m width, with *conditional* pairwise separations |
| **X — along deck** | longitudinal | 1D cutting-stock / interval packing per lane, plus a *stagger* decision |

So the per-truck problem is **2D packing of axis-parallel rectangles with fixed orientation and
disjunctive separation constraints** — not general 3D packing. No rotation about Z (piles must
lie lengthwise), only a 180° head-to-toe flip. That is a much smaller search space, and it means
you can get near-optimal answers fast with purpose-built heuristics rather than a general solver.

### 1.1 The helix constraint is the whole game

This is the part no off-the-shelf product models, and it is where the packing gain lives.

Model a pile as:

- shaft: radius `r`, length `L`
- helices: a list of `{offset from butt, radius R, plate thickness t}`
- `helicesMayOverlap: boolean` (true for single-helix, false for double-helix — per your rules)

For two piles `i`, `j` in the same tier, at lateral centres `y_i`, `y_j`:

At each station x along the deck each pile presents a radius — the helix radius
where a plate covers that station, the shaft radius everywhere else. The required
separation is the largest requirement over all shared stations:

```
1. Shafts are absolute. Wherever two piles overlap longitudinally:
       |y_i − y_j|  ≥  r_i + r_j + clearance

2. A helix may never overlap a neighbour's SHAFT. Where one pile presents a
   plate and the other bare shaft:
       |y_i − y_j|  ≥  R_i + r_j + clearance

3. Where both present a plate at the same station:
       |y_i − y_j|  ≥  R_i + R_j + clearance
   UNLESS both piles are single-helix, in which case the plates interleave
   horizontally at the same level and may overlap in plan, so rule 2 binds on
   each side instead:
       |y_i − y_j|  ≥  max(R_i + r_j, r_i + R_j) + clearance
```

Confirmed with the business, 2026-08-22: single-helix plates sit *beside* each
other horizontally, never riding over the neighbour's shaft — so tier height is a
constant, not a function of x. And a double-helix pile forfeits the relaxation
against *any* neighbour, single or double.

Rule 2 is what makes staggering pay. Sliding a pile so its plates miss the
neighbour's drops the requirement from `R_i + R_j` to `max(R_i + r_j, r_i + R_j)`
— for a 450 mm plate on a 168 mm shaft, from 450 mm apart to 309 mm.

Implemented and tested in
[`packages/core/src/geometry/separation.ts`](../packages/core/src/geometry/separation.ts).

The second constraint is **disjunctive** — it switches on only when two helices happen to sit at
the same station along the deck. That is precisely why longitudinal staggering works: slide one
pile 300 mm along the deck (or flip it end-for-end) and the helices no longer share a station, so
the pair can close up to shaft clearance. On a job with many double-helix piles this is the
difference between packing at helix-OD pitch and packing at shaft-OD pitch — potentially a whole
truck.

In OR terms this is a **2D packing with pairwise disjunctive (big-M) separation constraints**,
which is a known but niche formulation. It is closest to *circle/cylinder packing in a rectangle*
literature (Birgin et al.) crossed with *container loading with practical constraints*.

**Consequence for tooling:** any generic packer forces you to approximate a double-helix pile as a
rectangle of width = helix OD, everywhere along its length. That is safe but wasteful. Quantifying
that waste is your business case — see the baseline milestone in §7.

### 1.2 The other three sub-problems

- **Weight distribution** is a *linear* function of the layout. Once longitudinal positions are
  fixed, axle-group reactions come from simple statics (sum of moments about the axle groups). So
  axle compliance is cheap to evaluate and can be posted as linear constraints or scored as a
  penalty. This is the well-studied *Container Loading Problem with Axle Weight constraints*
  (SCLPAW).
- **Multi-truck assignment** is heterogeneous bin packing / set partitioning over a fleet with
  different deck sizes, tare masses, axle configurations and costs.
- **Multi-phase with early shipment + storage** is a *multi-period* variant: each pile has a
  required-by phase `p` and may ship in any phase `q ≤ p` at a storage cost. This is lot-sizing
  bolted onto bin packing — an extra dimension on the assignment problem, not a new problem.

---

## 2. Constraint inventory

### Geometric
- Deck length, width, headboard, deck height above road
- Tier count; dunnage 100×100 mm hardwood between tiers (Truck Loading Code)
- Shaft clearance (hard), helix clearance (conditional, per §1.1)
- Rear/front overhang of load beyond deck
- Total loaded height ≤ 4.3 m including deck height

### Mass
- Individual axle limits, axle-set limits, combined axle-set (bridge formula) limits
- GVM / GCM / brake code mass (manufacturer ratings — often bind before legal limits)
- ≥ 20% of vehicle mass on front axles
- Trailer:truck gross mass ratio ≤ 1.5
- Lateral balance (left/right) — not legally specified but a hard operational requirement

### Stability
- SRT ≥ 0.35g for NC trucks > 12 t GVM; TD trailers > 10 t GVM with load height > 2.8 m must be
  certified. Practically: keep CG low, put heavy/large-OD piles in the bottom tier.

### Restraint (drives layout, often overlooked)
- Forward restraint ≥ 1.0 × payload weight; rearward, sideways 0.5; vertical 0.2
- Aim for ~half from baulking/chocking, half from lashings + friction
- Headboard rated to half the rated payload capacity
- Pipe loads: front tier butted to headboard; **four chocks on top of the spacers per tier**;
  **≥ 2 chains/webbings per tier**, over or adjacent to the spacers
- ⇒ the number of tiers and the dunnage positions are a *cost* (chains, chocks, labour), not free

### Regulatory / operational
- Overdimension category → travel-time bans, pilots, permits (see §3.3) — a real cost in a quote

---

## 3. NZ regulatory limits (Land Transport Rule: VDAM 2016)

Numbers below are from NZTA factsheet 13 (May 2021 edition) and factsheet 53a. **Put these in a
versioned data file, not in code** — see the live example in §3.4.

### 3.1 Dimensions (standard vehicles, general access)

| | Limit |
|---|---|
| Width (incl. load) | **2.55 m** (excludes side marker lamps, indicators, collapsible mirrors ≤240 mm, tyre bulge) |
| Height (incl. load) | **4.3 m** |
| Rigid truck overall length | **12.6 m** not towing; **11.5 m** if towing |
| Semi-trailer combination | **19 m** (18 m for some pre-1/12/2016 quads with two steering axles) |
| Truck + full/simple trailer, A-train, B-train | **20 m**; **22 m** for rigid + simple trailer, or a rear full trailer with reduced-width overhang on a certified underrun |
| Forward distance | rigid 9.5 m (8.5 m if towing); semi-trailer 9.2 m; full/simple/pole trailer 8.5 m |
| Rear overhang, heavy rigid | lesser of 4 m from rear axis or 70% of foremost-axle-to-rear-axis (4.25 m if rearmost axle steers) |
| Rear overhang, semi-trailer | lesser of 4.3 m from rear axis or 50% of forward distance |
| Rear overhang, full/pole trailer | lesser of 4 m or 50% of front axis to rear axis |
| Rear overhang, simple trailer | lesser of 4 m or 50% of tow coupling to rear axis |

**Projecting loads.** Truck + full trailer may carry an overhanging load up to **2.3 m wide**
(1.15 m each side of centreline), extending past the 20 m limit to **22 m** — a certified rear
underrun system is required if that overhang exceeds 1 m. Any load overhanging > 1 m front/rear or
> 200 mm to either side needs a 400 × 300 mm flag or hazard panel by day and specified red/white
lamps by night.

### 3.2 Mass

Individual axles (Class 1 roads), kg — S = single standard tyre, SL = large, SM = mega, T = twin:

| S | SL | SM | T |
|---|---|---|---|
| 6 000 | 7 200 | 7 600 (7 200 steering) | 8 200 |

Axle sets: tandem 11 000–14 500 depending on tyre/steer configuration and load sharing;
tri-axle 15 500–18 000 by spacing; quad 20 000 (3.75–4.0 m).

Combined axle-set ("bridge formula") — total mass vs distance first axle to last axle:

```
 1.8 m → 15 500 kg      8.2 m → 31 000 kg     14.0 m → 40 000 kg
 3.0 m → 19 000 kg     10.0 m → 34 000 kg     16.0 m → 44 000 kg
 5.1 m → 25 000 kg     12.0 m → 37 000 kg     16.8 m → 45 000 kg (min 7 axles)
 6.4 m → 28 000 kg     13.2 m → 38 000 kg     17.4 m → 46 000 kg (min 8 axles)
```

Plus: ≥ 20% of mass on front axles; trailer:truck gross mass ratio ≤ 1.5.

### 3.3 When you go over — three different regimes, and they matter for quoting

This trips people up, so be explicit in the model:

1. **HPMV permit** — for **divisible or indivisible** loads that are **overlength and/or
   overweight** but **never overwidth or overheight**. Route-specific. This is the regime a normal
   pile load would use to go above 44 t or past standard length.
2. **Overdimension permit** — only for **indivisible** loads. *A truckload of many piles is
   divisible*, so you generally **cannot** use an overdimension permit to justify an oversize pile
   load. A single very long pile is indivisible and can be. Encode this: `isDivisible = pileCount > 1`.
3. **Overweight permit** — separate process, contact NZTA.

Overdimension categories (by width × forward distance, plus these length rules):

- **Category 1**: length over standard but ≤ 25 m; or front/rear overhang over standard but ≤ 7 m;
  width up to 3.1 m
- **Category 2**: length > 25 m but ≤ 35 m; or overhang > 7 m but ≤ 10 m; width up to 3.7 m
- No permit required if within Cat 1/2 width-and-forward-distance limits **and** ≤ 5 m high **and**
  no overhang > 7 m **and** overall ≤ 25 m

**Category 1 restricted travel times** (a genuine scheduling cost to surface in a quote):
no travel 0700–0900 or 1600–1800 Mon–Fri in city areas; no travel 1000–1300 or 1600–1900
Sat/Sun. City areas are enumerated in factsheet 53a (Auckland Albany–Drury, Christchurch, Dunedin,
Hamilton, Hastings, Invercargill, Napier, Nelson, New Plymouth, Palmerston North, Tauranga,
Whanganui, Wellington, Whangārei).

### 3.4 Live regulatory change — evidence for keeping rules as data

As of **6 August 2026** NZTA removed 50MAX permits; operators move to revised proformas. Permits
expiring 6 Jul–5 Nov 2026 are extended to 5 Nov 2026; those expiring after 6 Nov 2026 must comply
with the revised proformas by that date. Further VDAM phases: consultation Oct 2026 (Phase 3) and
mid-2027 (Phase 4).

Rules change under you. Keep limits in `data/nz-vdam-limits.<version>.json` with an effective
date, and stamp the ruleset version onto every saved quote so an old quote can be re-explained.

---

## 4. Are there general solutions?

Not one that you can lift off the shelf, but the sub-problems are all well-studied.

- **Container loading with practical constraints** — the umbrella literature. Bortfeldt & Wäscher's
  survey taxonomy (stability, stacking, weight distribution, complete-shipment, multi-drop) maps
  almost one-for-one onto your constraint list. Useful mainly as vocabulary and for knowing which
  constraints are known-hard.
- **Container loading with axle weight constraints (SCLPAW)** — Alonso et al. and successors. The
  standard approach is a **GRASP wall-building heuristic + an LP/MILP repair step** that shuffles
  placements to fix axle loads. This is directly applicable and is the pattern I'd copy: construct
  geometrically, repair the weight distribution linearly.
- **Cylinder packing in a rectangular container** — Birgin, Martínez & Ronconi give nonlinear
  programming formulations. Relevant to the lateral packing sub-problem, but assumes free 2D
  placement; your lane structure is stronger and simpler.
- **1D cutting stock / column generation** — the right frame for "what goes in one lane along the
  deck". Pattern enumeration + set covering is exact for realistic pile-length catalogues.
- **Logic-based Benders / branch-and-check** — the right frame for the *interaction* between "which
  piles on which truck" (master) and "do they geometrically fit" (subproblem). Infeasible
  assignments feed back as no-good cuts. This is the standard way to stop the two levels from
  fighting each other.

**What is genuinely novel in your problem** is the conditional helix separation, which does not
appear in any of that literature. You will have to write it. The good news: it is a ~50-line
feasibility predicate, not a research project — the difficulty is in the *search* that exploits it.

---

## 5. Existing software

**Commercial load planners** — all rectangular-first, subscription, and none model helices:

| Product | Relevant capability | Gap for you |
|---|---|---|
| [Cargo-Planner](https://cargo-planner.com/road-trailer-loading-software/) | Best fit found. Explicit pipe/drum support and "pipe nesting", axle-group limits with re-optimisation, custom trailer builder (multi-deck, 8 axles), REST API + embeddable 3D SDK | No helix model; no phased delivery; NZ VDAM rules not built in; per-seat SaaS |
| [ORTEC 3D Load Optimization](https://ortec.com/products/apps-and-services/3d-load-optimization) | Enterprise constraint-based load planning, strong visualisation | Heavyweight, enterprise sales cycle, not embeddable in a small static quoting tool |
| [Load Xpert](https://www.loadxpert.com/load-planning-software/) | Flatbeds, axle-load printouts, 2D+3D | Desktop, rectangular items |
| EasyCargo / CubeMaster / MaxLoad Pro / 3DLoadCalculator / LoadOptimizer.ai | General cartons/pallets | Not applicable to slender cylinders with appendages |

**Open source** — [binpackingjs](https://github.com/olragon/binpackingjs) (2D maximal-rectangles,
3D pivot placement), `3d-bin-packing` on npm, [dwave-examples/3d-bin-packing](https://github.com/dwave-examples/3d-bin-packing)
(CQM formulation, useful as a modelling reference). All rectangular. Useful to read, not to depend on.

**Solvers usable from a static site**: `highs-js` (HiGHS compiled to WASM — good, actively
maintained, MILP/LP) is the realistic option if you want an exact component. OR-Tools CP-SAT has no
official WASM build. `javascript-lp-solver` is fine for the tiny axle-balance LP only.

**Recommendation: build.** The differentiator — helix-aware staggering, NZ VDAM compliance, phased
delivery with storage, and a quote-ready drawing — is exactly the part you cannot buy. But
**trial Cargo-Planner for a fortnight first**: it is cheap insurance, it will teach you the UX
conventions loaders expect, and if it turns out to get within a few percent on your real jobs you
should know that before writing a solver.

---

## 6. Recommended architecture

### Stack
- **Vite + React + TypeScript**, deployed static (Cloudflare Pages / Netlify / GitHub Pages)
- Solver in **plain TypeScript in a Web Worker** — keeps the UI responsive, no server, no customer
  data leaves the browser (a real selling point for commercially sensitive piling schedules)
- **PapaParse** for CSV; JSON import/export for whole jobs so a quote is reproducible
- **SVG for both views**, not WebGL. The 2D exploded top-down is obviously SVG. For the isometric
  view, use a true axonometric projection rendered as SVG too: it prints crisply into a quote PDF,
  needs no WebGL, and is deterministic to snapshot-test. Add three.js later *only* if interactive
  3D turns out to be needed.
- Print stylesheet → PDF via the browser. Avoid a PDF library until it's proven necessary.

### Module boundaries

```
src/
  domain/        pile, pileType, truck, trailer, fleet, job, phase — types + zod schemas
  rules/         nz-vdam-limits.json, restraint rules, category classification
  geometry/      placement, footprint, conditional-separation predicate, collision
  solver/
    baseline/    bounding-box lane packer (the control)
    lanes/       lane pattern generation + staggering
    assign/      truck/fleet assignment, multi-phase
    improve/     LNS / simulated annealing
    evaluate/    axle statics, CG, cost model, objective weights
  validate/      one pure function: Plan -> Violation[]   (used by solver AND manual edits)
  render/        svg-topdown, svg-isometric, svg-loadchart
  ui/
```

**The single most important design decision:** `validate(plan) -> Violation[]` is a pure function
that the optimiser and the manual editor both call. Never let the optimiser and the UI disagree
about what's legal. Every violation carries a human-readable reason and a reference to the rule
(`"VDAM tri-axle set 2.4–2.49 m spacing: 17 500 kg limit, actual 17 940 kg"`). That single function
is what makes the tool trustworthy for quoting.

### Algorithm, in the order I'd build it

1. **Construct** — sort piles (longest/heaviest first), generate lane patterns per tier, place
   greedily with the conditional-separation predicate. Try both flips.
2. **Repair weight** — with positions fixed, solve/greedily shuffle for axle compliance and lateral
   balance. Linear, cheap.
3. **Improve** — Large Neighbourhood Search: rip out a random tier / lane / truck and re-insert.
   Accept by weighted objective. Time-boxed to ~2 s so quoting stays interactive.
4. **Assign across trucks & phases** — outer loop over the fleet, with infeasibility from steps 1–3
   fed back as no-good cuts on the assignment.

Objective as an explicit weight vector so the UI's "minimise volume / minimise weight / best
packing" toggles are just presets over the same function:
`cost = w1·truckCost + w2·overdimensionPenalty + w3·tierCount + w4·axleImbalance + w5·storageCost`.

---

## 7. Project plan

Each phase ends with something usable. Nothing here requires the next phase to be worth having.

**Phase 0 — Domain capture (do this before any code).**
Sit with the yard crew. Get 5–10 *real* past loading plans with photos and the actual truck used —
these become your regression fixtures and the only honest measure of whether the optimiser is any
good. Nail down the clearance rules (see the open questions in §8). Build the pile-type catalogue
and the fleet catalogue as data. *Deliverable: `data/` + `fixtures/`.*

**Phase 1 — Model, validate, visualise. No optimiser.**
Domain types, VDAM ruleset, `validate()`, axle/CG calculator, manual drag-and-drop layout editor,
both SVG views, CSV import. *Deliverable: a tool that checks a plan a human made.* This alone is
worth shipping — it catches overloaded axles today.

**Phase 2 — Baseline packer (the control).**
Bounding-box lane packing, no helix intelligence. Run it over the Phase 0 fixtures and record
trucks-used. *Deliverable: a number to beat, and your business case for Phase 3.*

**Phase 3 — Helix-aware packer.**
Conditional separation, longitudinal staggering, flip decisions, LNS. Report the delta vs baseline
on every fixture. *Deliverable: the actual product differentiator, with evidence.*

**Phase 4 — Fleet selection across multiple trucks.**
Heterogeneous bin packing, cost model, mixed truck/trailer combinations. *Deliverable: "this job
needs 2× 8-wheeler + trailer and 1× semi, $X".*

**Phase 5 — Multi-phase delivery with storage.**
Ship-early-and-store trade-off. *Deliverable: phase-aware quoting.*

**Phase 6 — Quoting polish.**
Objective presets, manual override with live re-validation, printable loading plan with per-tier
diagrams, chain/chock/dunnage schedule, permit and travel-time flags.

### Testing strategy (decide this in Phase 1, not later)

- **Property tests**: no two piles ever overlap; no plan ever violates `validate()`; every pile
  appears exactly once. Run these against randomly generated jobs — packing bugs are geometric and
  hide well from example-based tests.
- **Golden files**: snapshot the SVG output for the fixture jobs; diffs are visually reviewable.
- **A solution-quality dashboard**: a script that runs the whole fixture suite and prints
  trucks-used and deck utilisation per job, with the previous run alongside. Heuristics regress
  silently — without this you will make the packer worse and not know.

### Risks

| Risk | Mitigation |
|---|---|
| Clearance rules in the model don't match what the yard actually does | Phase 0; validate against real photographed loads before building the solver |
| "Optimal" is expected to mean provably optimal | Set expectations now: near-optimal in 2 s beats optimal in 10 min for quoting. Show the utilisation %, not a claim of optimality |
| Regulatory change invalidates saved quotes | Versioned ruleset data files; stamp version on every quote (§3.4) |
| Solver too slow in-browser | Web Worker + hard time box + always return the best-so-far |
| Overdimension/HPMV regimes conflated | Encode the divisible/indivisible distinction explicitly (§3.3) — getting this wrong produces unquotable plans |

---

## 8. Open questions for the business

Answer these before Phase 1 — several change the data model.

**Geometry / helices**

> ~~1. Does an overlapping single helix ride *over* the neighbour's shaft?~~
> **Answered 2026-08-22: no — beside it, horizontally. Tier height is constant.**
>
> ~~2. Does "helices must not overlap" apply between a double-helix and a single-helix pile?~~
> **Answered 2026-08-22: yes — a double-helix pile forces full separation against any neighbour.**

3. Is head-to-toe flipping (butt at the rear) allowed in practice, or do all piles load the same way
   for unloading order?
4. Minimum shaft-to-shaft clearance, in mm — and is it constant or a function of diameter?
5. Can piles of different lengths share a lane end-to-end? Can a tier mix diameters (it wastes
   height, but may still win)?

**Loading practice**
6. Maximum tiers in practice? Is it limited by height, by the crane/hiab, or by chain count?
7. Are piles ever bundled/strapped before loading? A bundle would be a composite item in the model.
8. Does unloading order matter (multi-drop / multi-site jobs)? If yes, that's a real extra
   constraint and should be scoped in early, not retrofitted.

**Commercial**
9. Cost model: per-truck flat rate, per-km, or per-tonne-km? What does a pilot vehicle or a
   restricted-travel-time window actually cost?
10. Storage cost for shipping a phase early — per pile per week, or a flat yard charge?
11. Which truck/trailer configurations do you actually have access to, and are they owned or hired?
    (Determines whether fleet selection is a choice or a constraint.)

---

## Sources

- [NZTA Factsheet 13 — Vehicle dimensions and mass](https://www.nzta.govt.nz/assets/resources/factsheets/13/docs/13-vehicle-dimensions-and-mass.pdf)
- [NZTA Factsheet 53a — Overdimension vehicles and loads](https://www.nzta.govt.nz/assets/resources/factsheets/53/docs/53-overdimension.pdf)
- [Land Transport Rule: Vehicle Dimensions and Mass 2016](https://www.nzta.govt.nz/assets/resources/rules/docs/vehicle-dimensions-and-mass-2016.pdf)
- [NZTA — Heavy vehicle productivity rule reform](https://www.nzta.govt.nz/business/heavy-vehicle-productivity-rule-reform)
- [NZTA — High productivity motor vehicles (HPMV)](https://www.nzta.govt.nz/vehicles/vehicle-types/vehicle-classes-and-standards/vehicle-dimensions-and-mass/high-productivity-motor-vehicles)
- [Truck Loading Code — Strength requirements of restraint systems](https://www.nzta.govt.nz/roadcode/heavy-vehicle-road-code/the-truck-loading-code/general-requirements/strength-requirements-of-restraint-systems)
- [Truck Loading Code — Pipe loads](https://www.nzta.govt.nz/roadcode/heavy-vehicle-road-code/the-truck-loading-code/specialised-requirements/pipe-loads)
- [The single container loading problem with axle weight constraints](https://www.sciencedirect.com/science/article/abs/pii/S0925527313001084)
- [Practical constraints in the container loading problem: comprehensive formulations and exact algorithm](https://www.sciencedirect.com/science/article/pii/S0305054820303038)
- [Optimizing the packing of cylinders into a rectangular container: a nonlinear approach](https://www.ime.usp.br/~egbirgin/publications/bmro3.pdf)
- [Cargo-Planner — road trailer loading](https://cargo-planner.com/road-trailer-loading-software/)
- [binpackingjs](https://github.com/olragon/binpackingjs) · [dwave-examples/3d-bin-packing](https://github.com/dwave-examples/3d-bin-packing)
