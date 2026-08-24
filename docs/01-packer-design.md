# The Packer — Design & Implementation Plan

Written 2026-08-22, against commit `8096c30`. Read
[00-problem-analysis.md](00-problem-analysis.md) first; this is the concrete
build plan for what that document calls Phases 3–5, plus the five options and
three hard requirements the business has since asked for.

Nothing here is written yet. `arrangeNaively` in
[`solver/baseline.ts`](../packages/core/src/solver/baseline.ts) stays exactly as
it is — it is the control, and the whole point is to be able to quote the delta
against it.

---

## 1. What was asked for

Five options:

1. Optionally allow piles from later phases to be delivered early.
2. Optionally allow **vertical** interleaving as well as horizontal.
3. Cap the number of tractors running without an attached trailer at one.
4. Make the minimum clear between a helix and a shaft configurable.
5. Make head-to-toe flipping optional.

Three hard requirements:

6. Total mass under the vehicle's weight limit.
7. The load within the volume limits of the trailer.
8. The load balanced within a configurable tolerance.

(6) and (7) are partly done. `validatePlan` already errors on `over-payload`,
`over-height` and `over-width`, and `arrangeNaively` already respects payload and
height. What is missing is stated in §5. (8) does not exist at all today — see
§4.6.

---

## 2. Three answers that shape the model

Confirmed with the business before writing this:

**Vertical interleaving means a helix rides over the neighbour's shaft.** One
pile sits higher than its neighbour so its plate passes above the neighbour's
shaft. Two consequences: separation stops being a lateral distance and becomes a
3-D axis distance, and tier height stops being a constant.

**Vehicles decompose into units.** A combination is a towing unit plus towed
unit(s), and may be dispatched as the towing unit alone when the trailer is not
worth taking. At most one such solo movement per plan.

**The packer chooses the fleet mix.** It selects which vehicles and how many of
each from the catalogue, rather than repeating one chosen vehicle as today.

Two more confirmed after the first draft of this plan, and folded in above:
**head-to-toe flipping is an option, not a fixed rule** (§4.7), and **the load
must be balanced within a configurable tolerance** (§4.6) — a hard constraint,
not the objective-weight-only treatment the first draft gave it.

### 2.1 One thing worth pushing back on

Vertical interleaving contradicts an answer already recorded in
[§8 of the analysis](00-problem-analysis.md#8-open-questions-for-the-business):

> ~~1. Does an overlapping single helix ride _over_ the neighbour's shaft?~~
> **Answered 2026-08-22: no — beside it, horizontally. Tier height is constant.**

Both can be true — "not how we normally load" and "allowed when it pays" — and
that is how it is modelled below: `allowVerticalInterleaving` defaults **off**,
and turning it on costs deck height, restraint complexity and static roll
threshold. But §8 needs amending to say so, or the next reader will take the
recorded answer as final. **Assumption: it is an option, not the new norm.**

---

## 3. Where the current code already fits, and where it does not

| Piece                                                                   | State                                                     | What the packer needs                                                                          |
| ----------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`geometry/profile.ts`](../packages/core/src/geometry/profile.ts)       | Good. Radius-vs-station profile, flip-aware, breakpoints. | Unchanged. This is already the right representation.                                           |
| [`geometry/separation.ts`](../packages/core/src/geometry/separation.ts) | One clearance added after the max; lateral only.          | Per-case clearance inside the max; return a 3-D axis distance. §4.1                            |
| [`domain/loading.ts`](../packages/core/src/domain/loading.ts)           | `LoadingOptions`, tier heights.                           | `clearance` → `clearances`; tier height must account for lift. §4.2                            |
| [`domain/placement.ts`](../packages/core/src/domain/placement.ts)       | `{id, consignmentId, pileTypeId, tier, x, y, flipped}`.   | Gains `lift` and `deckIndex`. §4.2, §4.4                                                       |
| [`domain/vehicle.ts`](../packages/core/src/domain/vehicle.ts)           | One deck, flat `deckLength/Width/Height`.                 | `decks: Deck[]` + `towingUnitId`. §4.4                                                         |
| [`domain/job.ts`](../packages/core/src/domain/job.ts)                   | Quantity per type, no phase.                              | `JobLine.phaseId`, `Job.phases`. §4.5                                                          |
| [`validation/plan.ts`](../packages/core/src/validation/plan.ts)         | Payload, height, width, support, separation, bounds.      | Envelope and side margin §4.3; centroid balance §4.6; lift support §4.2; solo-unit count §4.4. |
| [`solver/baseline.ts`](../packages/core/src/solver/baseline.ts)         | The control.                                              | Untouched. Benchmarked against forever.                                                        |
| [`io/appState.ts`](../packages/core/src/io/appState.ts)                 | Format version 5.                                         | One bump to 6 covering every change below. §7                                                  |
| `PlanSection.tsx`                                                       | Hardcodes `DEFAULT_LOADING_OPTIONS`, one vehicle.         | Options panel, fleet selection, plan-scope violations. §8                                      |

### 3.1 A gap the new geometry closes for free

`loadScene.ts` computes a pile's axis height as
`tierBaseHeight(...) + maxRadius(type)` — every pile rests on its own widest
point, so **piles of different diameters in one tier already sit at different
heights**. The separation predicate ignores that and compares lateral distance
only, which is safe but conservative.

Once separation is 3-D (§4.1) that conservatism disappears: a 139 mm pile beside
a 168 mm pile with a 450 mm helix has 275 mm of vertical offset, dropping the
required lateral gap from 520 mm to 441 mm. Free, and geometrically exact for
parallel cylinders.

It also means **axis height must move into `core`**. It is load-bearing geometry
being computed in the renderer today; `packer`, `validate` and `loadScene` must
all get it from one `axisHeightOf()` in `domain/loading.ts`.

---

## 4. Model changes

The whole options surface in one place, so it can be reviewed as a unit. Each
field is justified in the subsection cited beside it.

```ts
export interface PackingOptions extends LoadingOptions {
  readonly clearances: ClearanceOptions; // §4.1
  readonly balance: BalanceTolerance; // §4.6

  /** Option 5. May a pile be loaded tip-to-headboard? */
  readonly allowFlips: boolean; // §4.7

  /** Option 2. May a plate ride over a neighbour's shaft? */
  readonly allowVerticalInterleaving: boolean; // §4.2
  readonly liftPackerThickness: Millimetres;
  readonly maxLift: Millimetres;

  /** Option 1. May demand for a later phase ship on an earlier truck? */
  readonly allowEarlyDelivery: boolean; // §4.5
  readonly maxPhasesEarly: number;

  /** Option 3. Movements that leave their trailer behind. */
  readonly maxSoloTowingUnits: number; // §4.4

  /** Requirement 6. Bearers, chains and chocks are mass too. */
  readonly ancillaryMassPerTier: Kilograms; // §5

  readonly weights: ObjectiveWeights; // §6.6
  readonly timeBudgetMs: number; // §6.5
}
```

Per-deck overhang allowances (requirement 7) sit on `Deck`, not here — they are a
fact about a particular trailer, not about how this job is being loaded. §4.3.

### 4.1 Separation: per-case clearances, and a 3-D distance

The requested option (4), plus the two siblings it needs to stay coherent.

```ts
export interface ClearanceOptions {
  /** Shaft to shaft — the absolute floor, wherever two piles overlap. */
  readonly shaftToShaft: Millimetres;
  /** A helix plate passing a bare shaft. Rule 2 — the one staggering exploits. */
  readonly helixToShaft: Millimetres;
  /** Two plates at the same station, when they cannot interleave. */
  readonly helixToHelix: Millimetres;
}
```

`requiredLateralSeparation` today computes `max` over stations of
`radiusA + radiusB` and adds one clearance at the end. With three clearances the
addition has to move **inside** the max, because which clearance applies depends
on which case each station is in:

| Station                     | Requirement                            |
| --------------------------- | -------------------------------------- |
| both bare shaft             | `rA + rB + shaftToShaft`               |
| one plate, one shaft        | `RA + rB + helixToShaft`               |
| both plates, may interleave | `max(RA + rB, rA + RB) + helixToShaft` |
| both plates, no interleave  | `RA + RB + helixToHelix`               |

with `rA + rB + shaftToShaft` as an unconditional floor.

This is behaviour-identical when all three clearances are equal, so
`DEFAULT_LOADING_OPTIONS` keeping 25/25/25 means the existing
`separation.test.ts` cases pass unchanged. New tests cover the cases where they
differ.

The function is then renamed for what it actually returns:

```ts
/** Minimum perpendicular distance between two parallel pile axes. */
export function requiredAxisDistance(a, b, options): Millimetres;

/** Minimum |Δy| given a known vertical offset between the axes. */
export function requiredLateralSeparation(a, b, options, deltaZ = 0) {
  const d = requiredAxisDistance(a, b, options);
  return Math.sqrt(Math.max(0, d * d - deltaZ * deltaZ));
}
```

At `deltaZ = 0` this is exactly today's answer, so the change is additive.
`pilesConflict` takes the real Δz from `axisHeightOf` (§3.1) rather than
assuming zero.

### 4.2 Vertical interleaving: `Placement.lift`

```ts
/**
 * Packing under this pile, above the tier's bearer line.
 *
 * Lifting a pile is what lets its neighbour's plate pass underneath — vertical
 * interleaving. Zero unless `allowVerticalInterleaving` is on.
 */
readonly lift: Millimetres;
```

Then `axisHeightOf(placed) = tierBaseHeight(tier) + lift + maxRadius(type)`, and
tier height becomes `dunnageThickness + max(lift + 2·maxRadius)` rather than
`dunnageThickness + 2·maxRadius`.

Three consequences that must not be skipped:

- **A lifted pile has to be sitting on something.** New option
  `liftPackerThickness` (the timber actually available) so lift is quantised to
  what the yard has, and `maxLift` as a ceiling. New validation rule.
- **A ragged tier crown breaks the support check.** `checkSupport` currently
  treats every pile in a tier as carrying the tier above. Bearers sit on the
  _crown_, so it must count only piles whose crown is within
  `dunnageThickness` of the tier crown. This is a correctness fix that vertical
  interleaving forces, and it is worth having regardless.
- **Height, SRT and restraint all get worse.** Raising the load raises the CG,
  and docs §2 requires SRT ≥ 0.35 g. Emit a warning whenever any lift is used
  and surface it in the plan view — this is a trade the loader should see, not
  one the packer makes silently.

### 4.3 The envelope: "within the volume limits of the trailer"

Requirement (7). Today only the total load width and height are checked, rear
overhang is a _warning_, and `sideMargin` is used by `lanesFor` but never
validated. The packer needs all three axes as hard bounds:

```ts
readonly maxRearOverhang: Millimetres;   // 0 = must fit on the deck
readonly maxFrontOverhang: Millimetres;
```

- longitudinal: `-maxFrontOverhang ≤ x` and `x + length ≤ deckLength + maxRearOverhang`
- lateral: `|y| + maxRadius(type) ≤ deckWidth / 2 - sideMargin`, **and** the
  ruleset's 2 550 mm (already checked)
- vertical: `deckHeight + loadHeight ≤ ruleset.maxHeight` (already checked)

The existing rear-overhang _warning_ stays for the 1 m flags-and-lamps
threshold — that is a different fact from "over the allowance".

**Assumption, stated because it is a real limitation:** VDAM's actual rear
overhang limits (§3.1 of the analysis — lesser of 4 m from the rear axis, or 70%
of foremost-axle-to-rear-axis) need axle positions, which were deliberately
removed from the model. A flat configurable allowance per vehicle is the honest
substitute; it cannot be derived, so it is data the yard enters.

### 4.4 Vehicles decompose into units

> **What came out differently (Stages 4+5, 2026-08-22).** The build inverted
> this section's data model. Rows stay one deck each; a trailer is a `Vehicle`
> whose new `towableBy: string[]` names the trucks allowed to tow it, and
> combinations are **composed at pack time** (`combinationsOf`) rather than
> pre-enumerated as multi-deck rows. There is no `Deck[]`, no `towingUnitId`,
> and no plan-scope violation: `Placement` gained `deck: 'truck' | 'trailer'`
> instead of `deckIndex`, `Consignment` gained `trailerId`, and every per-deck
> helper (`payloadCapacity`, `balanceTargetOf`, `loadableSpan`) kept working
> untouched because a deck _is_ a row. The ratio bonus below did land:
> `maxTrailerToTruckMassRatio` is now the `trailer-heavy` warning, and the
> 44 t route cap binds the combination as `over-combined-gross`. Deliberately
> **not** built in this pass: the solo-towing-unit cap (and with it the
> plan-scope `Violation`), any cost model / `ObjectiveWeights`, LNS / no-good
> cuts / time-boxing / the worker, phases, vertical interleaving, overall
> combination length limits, and SRT warnings. Fleet selection is a greedy
> fewest-movements loop (most piles per movement, ties to least deck area);
> the CSV gained `towable_by` (semicolon-separated) rather than deck columns.
>
> **Known limitation (noted 2026-08-23, deliberately not fixed).** Overhang
> allowances are per row and apply whether or not the row is in a
> combination, so a truck with `maxRearOverhang > 0` may legally hang steel
> off its tail _while towing_ — into the drawbar space ahead of the trailer
> (verified: the packer does this, and the validator accepts it, because
> both are correct to the model). One number cannot say "700 mm solo, zero
> when towing", and composed combinations reuse the same row for both roles.
> The yard's workaround is to set `maxRearOverhang: 0` on trucks that tow;
> the fix, when wanted, is an effective allowance of zero for the truck's
> rear (and the trailer's front) whenever the movement has a trailer, in
> both the packer's usable span and `checkEnvelope`.

Requirement (3) cannot be modelled without this. A _tractor_ alone carries
nothing, so a bare tractor would never appear in a load plan at all — the case
that actually bites is a **truck dispatched without its full trailer**, and a
truck-plus-trailer is genuinely two decks with a drawbar gap between them. So
multi-deck is not separable from the tractor rule; they land together.

```ts
export interface Deck {
  readonly length: Millimetres;
  readonly width: Millimetres;
  /** Deck surface above the road — counts against the 4.3 m limit. */
  readonly height: Millimetres;
  /** Overhang the yard will accept beyond this deck, front and rear. */
  readonly maxFrontOverhang: Millimetres;
  readonly maxRearOverhang: Millimetres;
  /** Where this deck wants its load centroid, from the headboard. §4.6 */
  readonly balanceTarget: Millimetres;
}

export interface Vehicle {
  readonly id: string;
  readonly name: string;
  readonly kind: VehicleKind;
  /** Decks this combination presents, front to back. */
  readonly decks: readonly Deck[];
  readonly tare: Kilograms;
  /** GVM for a single unit, GCM for a combination. */
  readonly maxGross: Kilograms;
  /**
   * What you are left with when the towed unit stays in the yard, as a
   * catalogue id. Null when this combination has nothing to drop.
   */
  readonly towingUnitId: string | null;
}
```

`Placement` gains `deckIndex: number`, with `x` measured from that deck's own
headboard.

The rule itself:

```ts
/** True when some other catalogue entry names this vehicle as its towing unit. */
export function isSoloTowingUnit(
  vehicle: Vehicle,
  catalogue: Catalogue,
): boolean;
```

and a plan-scope violation `too-many-solo-units` when the count of consignments
on such vehicles exceeds `maxSoloTowingUnits` (default 1).

That needs a **plan-scope `Violation`**, which does not exist — every `Violation`
today carries a `consignmentId`. Making it `string | null` is the smallest
change; `ConsignmentView` filters on it already, and `PlanSection` renders the
nulls above the per-truck list.

**Bonus:** `VdamRuleset.maxTrailerToTruckMassRatio` (1.5) is already in the
ruleset data and unenforced, because a single-deck `Vehicle` cannot express
"trailer mass" or "truck mass". Once decks belong to units it becomes checkable.

CSV gains `towing_unit_id` and repeated deck columns (`deck2_length`, … — the
same numbered-column convention `pileTypeCsv` already uses for helices, because
these catalogues are maintained in spreadsheets). Single-deck rows keep working
unchanged.

### 4.5 Phases and early delivery

```ts
export interface Phase {
  readonly id: string;
  readonly name: string;
  /** Sequence. Lower ships first. */
  readonly order: number;
}

export interface JobLine {
  readonly pileTypeId: string;
  readonly quantity: number;
  /** Null for an unphased job — the single-phase case stays a special case of this. */
  readonly phaseId: string | null;
}

export interface Job {
  readonly name: string;
  readonly phases: readonly Phase[];
  readonly lines: readonly JobLine[];
}
```

`Consignment.phase` already exists as `string | null`; it becomes `phaseId` and
points at `Job.phases`.

Options:

```ts
/** May demand for a later phase ride on an earlier consignment? */
readonly allowEarlyDelivery: boolean;
/** How many phases ahead. 1 = only the next phase may come early. */
readonly maxPhasesEarly: number;
```

Off, phases partition the demand and are packed independently. On, demand of
phase `p` may be assigned to a consignment of phase `q` where
`0 ≤ order(p) − order(q) ≤ maxPhasesEarly`, and the objective carries a storage
penalty proportional to piles × phases-early. Never the other way round: a pile
may ship early into storage, never late.

The schedule CSV gains an optional `phase` column; a file without one imports as
today.

**Assumption:** phases are ordered labels, not dates, and the storage cost is a
weight in the objective rather than a dollar figure per pile per week. Docs §8
question 10 is still unanswered, and until it is, a weight is honest and a dollar
figure is not.

### 4.6 Balance, within a configurable tolerance

Requirement (8), and the one thing on the list that does not exist in any form
today. Analysis §2 calls even distribution a hard operational requirement and
notes it is answerable from the load centroid alone — no axle geometry needed,
which is exactly why it survived the axle scoping-out.

```ts
export interface BalanceTolerance {
  /** How far the load centroid may sit from the deck's balance target. */
  readonly longitudinal: Millimetres;
  /** How far the load centroid may sit off the deck centreline. */
  readonly lateral: Millimetres;
}
```

Millimetres, not a fraction of the deck, because the README's units convention is
absolute below the presentation layer and a ratio would be the only exception in
the codebase. If one pair of numbers turns out not to cover both a 7.2 m rigid
and a 12.5 m semi, the escape hatch is a per-`Deck` override, not a ratio.

The centroid is a mass-weighted mean, so it is cheap to recompute on every edit:

```
x̄ = Σ mᵢ(xᵢ + Lᵢ/2) / Σ mᵢ      against deck.balanceTarget
ȳ = Σ mᵢ·yᵢ / Σ mᵢ              against 0
```

Per deck, on a multi-deck combination — each deck balances over its own target —
and the trailer:truck ratio (§4.4) is the across-deck counterpart.

**The longitudinal target is not automatically deck mid-length.** A semi wants
mass forward, toward the kingpin; a rigid with a rear axle group does not. That
difference is a fact about the vehicle, so `Deck` gains

```ts
/** Where this deck wants its load centroid, from the headboard. */
readonly balanceTarget: Millimetres;   // defaults to length / 2
```

Mid-length is the only defensible _default_ without axle positions, but it is a
default, not a truth, and a vehicle whose real target is 400 mm forward of centre
should be able to say so without anyone editing code.

#### 4.6.1 What the tolerance can and cannot be derived from

Worth stating plainly, because the numbers below are placeholders and the reason
they are placeholders is structural rather than laziness.

**No tolerance can be shown to "ensure legality."** Balance is not legally
specified (analysis §2). It is a proxy for three things that _are_ — individual
and axle-set limits, the ≥ 20% front-axle rule, and SRT ≥ 0.35 g — and all three
need the deck-origin-to-axle mapping that was deliberately deleted (README, _Why
there are no axle limits_). Deriving a legality-preserving tolerance means
reinstating exactly what was scoped out. Any number claiming otherwise is
pretending.

**So the placeholder must err tight, not loose.** This inverts the usual instinct
about defaults. Too tight rejects legal loads: the packer works harder, or
reports infeasible with the offset in the message — annoying, visible, and fixed
by one conversation. Too loose accepts illegal ones silently, and that reaches
the road. When the bound is underivable, safety lives at the tight end.

**Two ceilings _are_ derivable, and they bracket the useful range.**

_Vacuous ceiling_ — above this the rule can never fire, so shipping it is the
same as shipping with balance off:

```
lateral       = deckWidth / 2 − sideMargin − maxRadius
longitudinal  = deckLength / 2 − headboardGap − pileLength / 2
```

Against the catalogue examples in `VEHICLE_CSV_EXAMPLE` / `PILE_TYPE_CSV_EXAMPLE`
and `DEFAULT_LOADING_OPTIONS`:

| Combination        | Lateral ceiling | Longitudinal ceiling |
| ------------------ | --------------- | -------------------- |
| SEMI-45 + SP168-D6 | 950 mm          | 3 150 mm             |
| SEMI-45 + SP139-S4 | 1 000 mm        | 3 900 mm             |
| RIGID-8 + SP168-D6 | 950 mm          | **500 mm**           |

The RIGID-8 row is the instructive one: a 6 m pile on a 7.2 m deck has almost no
longitudinal freedom, so any tolerance above 500 mm is vacuous _there_ while
still biting on the semi. One global number does not mean one behaviour.

_Stability ceiling_ — indicative only, since track width and tare CG height are
not in the model. For a 4-tier SEMI-45 at 44 t, assuming a 2 000 mm track, a
900 mm tare CG and a load CG 1 100 mm above the deck, SRT ≥ 0.35 g implies a
whole-vehicle lateral offset ≤ ~340 mm, and the load carries 64% of the gross, so
**the load centroid ceiling is ~525 mm**. Below the geometric 950 mm — so
stability binds first, and a lateral tolerance anywhere near 500 mm is
unambiguously unsafe.

**And one floor.** The centroid cannot be tuned finer than one pile's worth of
mass on its available lever, `Δ = m_pile × lever / M_payload`. For a SEMI-45 full
of SP168-D6 (178 kg each, 28 200 kg payload): ~40 mm longitudinally, ~12 mm
laterally. Below that the tolerance is unreachable by swapping and depends
entirely on the continuous whole-load shift (§6.5) — whose range is whatever
slack the lane happens to have, and that collapses to ±150 mm for 6 m piles on a
12.5 m deck. A tolerance under about 50 mm longitudinally would be a coin flip.

#### 4.6.2 The placeholders

**Longitudinal 200 mm, lateral 50 mm.** Both per-deck overridable.

Longitudinal 200 mm is ~5× the 40 mm granularity floor, so it is reliably
hittable, and it is inside every vacuous ceiling in the table above — including
the awkward RIGID-8 row, where it is still doing work at 40% of the ceiling.

Lateral 50 mm is ~4× the 12 mm granularity and an order of magnitude inside the
~525 mm stability ceiling. It costs essentially nothing to hit: `lanesFor`
already generates lanes symmetric about the centreline, so a load is
near-balanced laterally by construction, and 50 mm is roughly the asymmetry one
unpaired pile introduces in a mixed tier.

Both are deliberately at the tight end. The bench (§9) reports the achieved
centroid offset per fixture, so within one Stage 2 run these stop being invented
numbers and become "the tightest value every real job already meets" — which is
the right thing to put in front of the yard when asking for the real one.

Two things follow that are worth being explicit about:

- **`PileType` has one `mass` and no distribution, so a pile's centre of mass is
  its midpoint.** Helices are heavy and sit toward the butt, so this is an
  approximation. Its practical consequence is that **flipping does not move the
  centroid**, which conveniently makes §4.7 a pure packing lever with no balance
  side-effect. If a mass distribution is ever added to `PileType`, flipping
  becomes a balance lever too and §6.5's repair step gains a knob.
- **Beyond tolerance is an `unbalanced` error, not a warning.** A configurable
  tolerance _is_ the knob for how strict this should be; having both a tolerance
  and a soft severity would be two knobs for one decision. The objective's
  `imbalance` weight still exists, but it only breaks ties _within_ tolerance —
  it decides between two legal plans, it does not decide legality.

### 4.7 Flips as an option

Option (5). `allowFlips` gates whether the packer may set
`Placement.flipped`. The field itself already exists and `profile.ts` already
honours it, so this is an option on the search, not a model change.

It matters more than its size suggests: flipping moves a pile's helices to
`length − offsetFromButt`, which is a second free stagger lever on top of
sliding (§6.2). Defaulted **on**, because the packing gain is real and turning it
off is the exception — but see §9: the benchmark reports every fixture both ways,
so _how much_ flipping is worth becomes a measured number rather than the
assumption it is today.

---

## 5. Mass and volume — requirements (6) and (7)

`validatePlan` already errors on `over-payload`, and `arrangeNaively` respects
it. Two things make it not yet true in the yard:

**Dunnage and restraint mass is excluded.** `consignmentMass` says so in a
comment. Bearers at 100 × 100 hardwood across a 2.45 m deck, four per tier, plus
chains and chocks, is tens of kilograms per tier — small against 28 t, but it is
the difference between "under the limit" and "under the limit on paper". Add
`ancillaryMassPerTier` to the options; the packer reserves it and `validatePlan`
counts it.

**Payload for a multi-deck combination.** `maxGross − tare` still holds for the
combination as a whole, but per-deck mass is what feeds the trailer:truck ratio
(§4.4). Both are sums; neither is expensive.

Volume is §4.3. Together these give a new derived report per consignment — mass
used / mass available, deck area used / available, height used / available —
which is what the plan view should show instead of just a truck count, and what
the benchmark in §9 records.

---

## 6. The packer

Structure, following the module boundaries in analysis §6:

```
solver/
  baseline.ts   arrangeNaively — the control, untouched
  options.ts    PackingOptions, defaults, objective presets
  lane.ts       lane patterns: fill one lane end-to-end; stagger candidates
  tier.ts       the lateral sweep — lanes into a tier
  truck.ts      tiers into one consignment
  assign.ts     demand → fleet → consignments; phases; no-good cuts
  improve.ts    LNS, time-boxed
  evaluate.ts   objective and utilisation metrics
  pack.ts       entry point: pack(job, catalogue, options) → PackResult
```

### 6.1 Lane patterns

A **lane** is a y-centreline within a tier. A **lane pattern** is the sequence of
piles laid end to end in it: `{pileTypeId, x, flipped}[]`, generated by 1-D
packing over `deckLength − headboardGap + maxRearOverhang` with `endGap`
between. Whatever length is left over is the lane's **stagger budget**.

### 6.2 Staggering is a discrete choice, not a search

This is the load-bearing idea, and the reason this is tractable.

The required separation between two lanes is a max over stations, and it only
changes at a **helix breakpoint** — `profile.ts` already produces exactly that
list. So sliding a lane continuously through its slack visits only finitely many
distinct answers, and the candidate offsets are computable directly:

> for each helix segment in the new lane and each helix segment in an already
> placed neighbour, the offset that puts this segment's start at that segment's
> end (and the reverse), clipped to the slack — plus 0 and full slack.

Typically fewer than 20 candidates per lane. No continuous optimisation, no
sampling, and the best staggered position is found **exactly** rather than
approximately.

Flips double the candidate set when `allowFlips` is on (§4.7): `flipped` moves a
pile's helices to `length − offsetFromButt`, a second free stagger lever.
Enumerating every per-pile flip is exponential in the lane, so: enumerate
whole-lane assignments (none, all, alternate) then hill-climb single flips. With
`allowFlips` off the packer simply never generates the flipped candidates, and
everything downstream is unchanged — which is what makes benchmarking both ways
(§9) a one-line difference rather than two code paths.

### 6.3 The tier sweep

Left to right across the deck:

1. Choose the next lane's pattern, x-offset and flips from the candidates above.
2. Place it at the smallest `y` satisfying `requiredLateralSeparation` against
   **every** pile already in the tier, not just the previous lane — the
   requirement is not monotone in lane index, and the all-pairs check is cheap
   at these sizes.
3. If `allowVerticalInterleaving`, also try lifts quantised to
   `liftPackerThickness`, trading deck height for lateral pitch.
4. Score by pitch consumed and keep the best _k_ (beam width ~8).

Reject the lane if it breaches the side margin (§4.3).

### 6.4 Tiers into a truck

Bottom-up, widest and heaviest first — low CG for SRT, and it keeps tier heights
from thrashing. Bounded by `maxTiers`, the height budget
(`ruleset.maxHeight − deck.height`), the payload budget, and the support rule
(§4.2). Mixed diameters in a tier are allowed but cost the height difference,
which the objective sees.

### 6.5 Assignment: fleet and phases

Heterogeneous bin packing over the catalogue, greedy-then-improve:

1. Repeatedly pick the vehicle with the best marginal cost per pile placed, pack
   it with §6.4, remove placed demand.
2. **Balance repair** (§4.6). This is the SCLPAW pattern analysis §4 recommends
   copying — construct geometrically, then repair the weight distribution
   linearly — and the centroid being a weighted mean is what makes it cheap:
   - _Longitudinal, exact and first:_ shift the whole load along the deck. The
     centroid moves 1:1 with the shift, so the correction is a single scalar,
     bounded below by `headboardGap` and above by the deck's rear overhang
     allowance. One subtraction, no search.
   - _Longitudinal, if the shift is not enough:_ swap heavy piles between front
     and rear slots within a lane. Positions are already fixed, so this only
     permutes which type sits where.
   - _Lateral:_ swap types between mirrored lanes. A symmetric lane layout is
     near-balanced by construction, so this is usually a no-op — it earns its
     keep on odd lane counts and mixed-diameter tiers.

   If the tolerance still cannot be met, the truck is repacked with the balance
   term promoted from tie-break to constraint; failing that it is reported
   infeasible with the centroid offset in the message, rather than silently
   emitting an unbalanced plan.

3. **Solo-unit repair.** Count solo towing units (§4.4). Above
   `maxSoloTowingUnits`, consolidate: move the smallest solo load onto another
   truck, or upgrade the movement to a full combination — whichever the
   objective prefers.
4. **LNS.** Rip out the one or two worst-utilised trucks and re-solve, accepting
   on the weighted objective. Time-boxed; always return the best so far.
5. Geometric infeasibility from step 1 feeds back as a no-good cut on the
   assignment, per analysis §4 (logic-based Benders). Without this the assignment
   and the geometry fight each other.

Phases (§4.5) enter as a filter on which demand may go on which consignment,
plus the storage term below.

### 6.6 Objective

```ts
export interface ObjectiveWeights {
  readonly truckCost: number;
  readonly tierCount: number; // chains, chocks, labour — tiers are not free
  readonly imbalance: number; // centroid offset *within* tolerance — §4.6
  readonly storage: number; // piles × phases shipped early
  readonly soloTowingUnit: number; // a movement that leaves its trailer behind
  readonly verticalLift: number; // raising the CG has a price
  readonly overdimension: number;
}
```

The UI's "minimise trucks / best packing / cheapest" toggles are presets over
this one vector, not separate code paths.

Note the split of responsibility with §4.6: `balance` is a **tolerance** and
decides legality; `weights.imbalance` is a **preference** and only chooses
between plans that are already legal. Same for `maxSoloTowingUnits` against
`weights.soloTowingUnit`, and `maxLift` against `weights.verticalLift`. Keeping
the two kinds of number apart is what stops the objective from being able to
buy its way out of a constraint.

---

## 7. Persistence

One bump, `STATE_FORMAT_VERSION` 5 → 6, covering: `vehicle.decks` +
`towingUnitId`, `placement.lift` + `deckIndex`, `job.phases` +
`jobLine.phaseId`, `consignment.phase` → `phaseId`.

Version 5 files read cleanly, in the style the reader already uses for
`helix.thickness`: flat `deckLength/Width/Height` become `decks: [{...}]`,
missing `lift` and `deckIndex` default to 0, missing `phaseId` to null.

**`PackingOptions` must be saved too**, and are not today — `PlanSection`
hardcodes `DEFAULT_LOADING_OPTIONS`. This is the same argument the README already
makes for `rulesetVersion`: a quote priced with a 25 mm helix clearance and
vertical interleaving on cannot be re-explained six months later unless the file
says so. `AppState` gains `options: PackingOptions`.

---

## 8. Web app

- **Packing options panel** — the four options plus clearances, overhangs and
  objective preset. Persisted (§7).
- **Fleet selection** — the "Load onto" dropdown becomes "which vehicles may this
  job use", multi-select, since the packer now chooses the mix.
- **Phases** — a phase column on the schedule table and CSV.
- **Multi-deck** — `ConsignmentView`, `TierPlanSvg` and `loadScene` render one
  deck each today; each becomes a per-deck repeat.
- **Plan-scope violations** — rendered above the per-truck list (§4.4).
- **Web Worker** — the packer runs off the main thread with a hard time box,
  per analysis §6. `core` stays DOM-free; the worker lives in `apps/web`.
- **Utilisation** — mass/area/height used vs available per truck (§5).
- The amber "this is the naive baseline" banner comes off, replaced by a
  baseline **comparison**: trucks used by the packer vs `arrangeNaively`. That
  number is the business case.

---

## 9. Testing

The README commits to property tests as the packer lands. Concretely, adding
`fast-check` to `@pile-on/core` devDependencies:

- every scheduled pile is placed exactly once, or reported unplaced with a reason
- `validatePlan(pack(...))` returns no errors, on random jobs
- no pair in a tier is closer than `requiredAxisDistance`
- the packer never uses more trucks than `arrangeNaively`
- separation is symmetric, monotone in each clearance, and never below the shaft
  floor
- every consignment's centroid is within `balance` tolerance of its deck centre
  and centreline (§4.6)
- flipping a pile leaves the centroid unchanged — this guards the uniform-mass
  assumption in §4.6, and will be the test that fails the day `PileType` gains a
  mass distribution
- round-tripping any plan through v6 serialisation is the identity

Plus:

- **Fixtures** — the real past loading plans from analysis §7 Phase 0, as
  `solver/fixtures/*.json`. These are the only honest measure of whether the
  packer is any good.
- **`scripts/bench.ts`** — the solution-quality dashboard: trucks used, deck
  utilisation and **achieved centroid offset** per fixture, with the previous run
  alongside. Heuristics regress silently; without this the packer gets worse and
  nobody notices.

  The centroid column is what turns §4.6.2's placeholders into evidence: after
  one Stage 2 run the tolerance can be set to the tightest value every real job
  already meets, rather than to a number someone chose.

  It runs each fixture **with `allowFlips` on and off**, so the column that has
  been an open question since Phase 0 (analysis §8 Q3) becomes a measured number.
  If flipping turns out to be worth a truck on real jobs, that is the argument
  for asking the yard to allow it; if it is worth nothing, the option can default
  off and nobody has to think about unloading order again.

- Core stays at its 95% coverage threshold.

---

## 10. Stages

Each ends with something that works and something that can be measured.

**Stage 1 — Foundations. ✅ Landed.** `ClearanceOptions` and per-case clearances
(§4.1); `axisHeightOf` moved into core (§3.1); envelope and side-margin
validation (§4.3); centroid and the `unbalanced` rule (§4.6); ancillary mass
(§5); options persisted at format version 6 (§7). Option (4) lands and
requirements (6), (7) and (8) all become true. _Deliverable: the validator tells
the whole truth — including, for the first time, whether a load is balanced._

Two things came out differently from how this section first described them, and
both are worth recording:

- **`PackingOptions` was not created.** The split that emerged is cleaner:
  `LoadingOptions` carries everything that decides whether a plan is _valid_ and
  is what `validatePlan` takes, while `PackingOptions` — the options that only
  shape what the search may try — waits until there is a search to shape, in
  Stage 2. Declaring `allowFlips` now would have shipped a toggle that does
  nothing, and `AppState.options` can widen in Stage 2 without a version bump.
- **`shiftToBalance` landed early**, in `solver/balance.ts`. It is §6.5's exact
  longitudinal repair, and the naive arranger needed it immediately: the moment
  balance became a rule, the control started producing plans the validator
  rejected. Stage 2 uses the same function. The arranger also gained a
  prefix-balanced cell order, which changes where the leftovers in a part-filled
  tier sit but not how many fit — truck counts are untouched, so the control is
  still the control.

**Stage 2 — The helix-aware packer, one vehicle type. ✅ Landed.** Lane patterns,
exact stagger candidates, flips behind `allowFlips` (§4.7), the beam sweep,
tiers (§6.1–6.4), and the balance repair (§6.5 step 2). _Deliverable: the
differentiator and option (5) — and the number._

Measured on `packages/core/src/solver/fixtures`, via `pnpm bench`:

| fixture           | piles | baseline | packed | no flips |
| ----------------- | ----- | -------- | ------ | -------- |
| single type, semi | 95    | 3        | **2**  | 2        |
| two types, semi   | 100   | 3        | **2**  | 2        |
| four types, semi  | 232   | 8        | **5**  | 6        |
| short deck, rigid | 96    | 3        | **2**  | 2        |
| 9 m piles, semi   | 24    | 2        | **1**  | 2        |
| **total**         |       | **19**   | **12** | **14**   |

**Seven trucks out of nineteen, and flipping is worth two of them.** That is
analysis §8 Q3 answered with evidence rather than opinion — and the number to
put in front of the yard when asking whether it is allowed.

What the implementation added beyond this plan, and why:

- **Mixed lengths down one lane.** §6.1 described a lane as a sequence, and it
  is: a 4.5 m pile behind a 6 m one uses deck that a lane of 6 m piles wastes.
  Also **mixed types across a tier**, which the baseline never does.
- **Lane _order_ is a balance lever.** Three equal-mass piles of 6 m, 3 m and
  3 m sit a metre off centre with the long one at either end and dead on it with
  the long one in the middle. A full lane has no slack to slide in afterwards,
  so the order has to be chosen up front — longest-first, shortest-first and
  longest-in-the-middle span the useful range without going factorial.
- **Three balance repairs, not one.** §6.5 called for the whole-load shift; it
  is not enough on its own. `settleTiers` slides each tier separately (one tier
  of 6 m piles pins both ends and the short tiers stay bunched at the headboard),
  aiming each at what the truck needs _so far_ rather than at the balance point,
  so a tier that cannot reach it is made up by the ones after. `mirrorTiers`
  turns alternate tiers round — the one lateral move that is always free.
  `nudgeLanes` moves single lanes and re-verifies, as a last resort.
- **The bottom tier does not get a vote on its own diameter.** A narrow tier is
  always denser per millimetre of height, so a free choice takes one every time
  and then no wide pile can go on that truck at all. The widest thing still
  wanted sets the ceiling and narrower piles fill the lanes it leaves.
- **Wide lanes go down before narrow ones.** Same trap one level down: density
  alone fills every tier with the small stuff and defers the wide piles, and
  deferring them never saves a truck.
- **Flipping is run both ways and the better kept.** The sweep is greedy, and a
  greedy search is _not_ monotone in how many candidates it is offered. On the
  fixtures, flipping saved a truck on one job and cost one on another until
  `pack` started packing twice and taking the winner.

Two limits, stated rather than papered over:

- **Balance is best-effort on adversarial geometry.** Clashes, the envelope,
  support and payload are absolute and property-tested over generated
  catalogues. Balance is a tolerance, and on five piles of wildly unequal mass
  and length the best reachable answer can sit outside a 200 mm one. The packer
  spends every lever it has and then leaves the violation visible.
- **The packer is not provably better than the baseline on _any_ catalogue.**
  Both are heuristics, and on geometry nobody would buy — a 9 m pile with a
  476 mm plate beside a 3.3 m plain shaft — either can come out ahead. The
  comparison that means anything is on real catalogues, which is what `pnpm
bench` measures.

**Stage 3 — Vertical interleaving.** `Placement.lift`, 3-D separation, tier
height, the crown-aware support fix, renderer, warnings (§4.2). _Deliverable:
option (2), with the height cost visible._

**Stage 4 — Vehicle decomposition.** Multi-deck vehicles, towing units, CSV,
persistence, per-deck rendering (§4.4). _Deliverable: the fleet is modelled as it
actually is, and the trailer:truck ratio becomes checkable._

**Stage 5 — Fleet selection, LNS, worker.** Heterogeneous assignment,
solo-unit repair, no-good cuts, time-boxing, off-thread (§6.5). _Deliverable:
option (3), and "this job needs 2 × 8-wheeler + trailer and 1 × semi"._

> **Stages 4+5, what came out differently (2026-08-22).** Landed together, and
> smaller than planned — see the deviation note at the top of §4.4 for the
> model that was actually built (single-deck rows + `towableBy`, combinations
> composed at pack time) and the full list of what was deliberately left out
> (solo-unit cap, costs, LNS, worker). Fleet selection shipped as a greedy
> fewest-movements loop with per-movement route-cap budgeting; the deliverable
> sentence — "this job needs 2 × 8-wheeler + trailer" — is real, at fixture
> `06-rigid-and-trailer`: baseline 4 movements, packed 2, zero errors.

**Stage 6 — Phases and early delivery.** `Job.phases`, `JobLine.phaseId`,
`allowEarlyDelivery`, the storage term (§4.5). _Deliverable: option (1)._

Ordering note: the requested options land 4, then 5, then 2, 3, 1 — not 1–5.
Phases are last not because they are least wanted but because "may this pile ride
early" is a filter on an assignment loop that does not exist until Stage 5.
Building it first would mean building it twice. Balance (requirement 8) is split
deliberately: the _rule_ is Stage 1, so that nothing downstream can be built
against a validator that tolerates unbalanced loads, and the _repair_ is Stage 2,
with the truck-level fallback in Stage 5.

---

## 11. Open questions this plan is blocked on or assuming past

Three of these are already in analysis §8 and are now on the critical path.

1. **Balance tolerance, and each deck's balance target** (§4.6). Placeholders of
   200 mm longitudinal / 50 mm lateral are argued for in §4.6.2 and are
   deliberately at the tight end, because no tolerance can be _derived_ to ensure
   legality — the legal constraints balance proxies for need the axle geometry
   that was scoped out. Two distinct asks:
   - the tolerance itself, which the §9 bench will have narrowed to an
     evidence-backed range by the end of Stage 2;
   - **`Deck.balanceTarget` per vehicle**, which the bench cannot supply. Only
     the yard knows that a given semi wants its load 400 mm forward of deck
     centre, and mid-length is a default standing in for an unasked question.
2. **§8 Q4 — minimum shaft-to-shaft clearance, in mm.** Now three numbers, not
   one (§4.1). Currently all three default to 25 mm, which is a placeholder.
3. **§8 Q5 — may a tier mix diameters, and a lane mix lengths?** Assumed **yes
   to both**, with the height waste priced by the objective.
4. **§8 Q10 — storage cost for shipping early.** Assumed to be an objective
   weight, not a dollar figure (§4.5).
5. **Per-vehicle overhang allowance** (§4.3) is data the yard must supply; it
   cannot be derived without axle geometry.

**§8 Q3 — is head-to-toe flipping allowed in practice? — is now closed as a
design question**: it is an option (§4.7), defaulting on. It stays worth asking
the yard, but it no longer blocks anything, and §9's two-way benchmark means the
answer arrives with a number attached rather than as a preference.

---

## 12. Revision: packs, rows and shaft-seated bearers

The free-form tier model above was later replaced by yard practice, in two
passes. First: piles travel in **packs** — banded, single-type, single-layer
bundles. Then the yard corrected the physics: a bearer is a single length of
timber touching only shafts, and a pack never lays piles end to end. The
rules as they stand, all enforced by `validatePlan` and honoured by
construction in the packer:

1. **A pack is piles side by side, flush at the leading end**
   (`pack-not-flush`), at most 1200 mm across (`PACK_MAX_WIDTH`,
   `pack-too-wide`), holding one pile type code only. Starters never share a
   pack with extensions; extensions of one code may mix lengths, longest
   first, but the packer prefers identical bundles and only mixes to mop up
   remainders (`pack-mixed-type`). Flipping is the one stagger lever inside
   a band: alternate piles loaded tip-first put their plates at the other
   end, and a pack of twin-helix starters closes from plate pitch to shaft
   pitch.
2. **A tier is rows of packs marching down the deck**, `endGap` apart — at
   most two packs abreast at any station (`too-many-packs`, checked as
   mutual x-overlap, exact by Helly's theorem on intervals), as many rows as
   the deck takes.
3. **Packs riding abreast weigh alike**: the lighter at least
   `minPackMassRatio` (default 70%) of the heavier, judged per x-overlapping
   pair; a pack with nothing beside it is exempt (`packs-unbalanced`).
4. **A pile seats its shaft on the bearers** — its axis sits one shaft
   radius above the tier's base, its plates hang below and stand proud
   above. Bearers are **derived, never stored**: the thickness under a layer
   is the smallest 50 mm multiple (`DUNNAGE_INCREMENT`) that clears the
   layer's own hanging plates above the surface beneath, and keeps every
   cross-tier pile pair clear in three dimensions — the same separation
   engine as within a tier, solved for height, in closed form. Judged
   against **every** lower tier, not just the one beneath, because a tall
   plate two tiers down can reach straight past a low middle tier. Stagger
   already spent shows up as lateral or longitudinal distance and buys the
   bearers down; what stagger cannot buy, thickness must, and `over-height`
   prices it. A cross-tier clash is therefore impossible to store at all.
5. **Layers narrow going up, at every station**: a pack must stand wholly on
   the footprint the tier below offers over the pack's own run of deck,
   where level packs (equal shaft-top planes) merge into one bearing surface
   (`unsupported-laterally`, via `footprintOver`).

What is deliberately not modelled: where along the deck each timber lands. A
station clear of plates is assumed to exist — true for real catalogues,
where plates are short bands on long shafts. The escalation hook, if it is
ever needed, is a per-tier clear-station check over the complement of the
lower tiers' helix intervals.

Module map as revised: `lane.ts` and `stagger.ts` (end-to-end fills and
stagger offsets) are gone, and with them the `beamWidth` and
`maxLanePatterns` search options (format version 12). `packBuilder.ts`
builds flush candidate packs per `(code, part)` group; `layer.ts` sweeps
rows of packs along each supported stretch, then slides each finished chain
toward the balance point; `pack.ts` keeps the fleet loop and the balance
pipeline (mirror -> settle -> shift, every move verified against footprint,
support and height, and rolled back when it breaks any of them). Pack
membership is the one stored fact (`Placement.pack`, the pack index within
its tier); everything else — widths, masses, bearers, footprints, the
manifest ids ("P1" onward) the table and the drawings share — is computed on
demand from `domain/packs.ts`, so the packer and the validator cannot drift.

The capacity cost is real and priced openly: on the bench fixtures the
packer stands at 20 trucks against the baseline's 28 (from 14 and 23 before
the pack rules, in two steps — pack banding first, then rows and shaft
seating). Balance took three extra levers to hold under the row rules: a
stretch's rows are re-ordered and slid so their weight lands on the balance
point (the runt row rides mid-chain, not at the rear), rows mirror across
the centreline to cancel each other, and the finished deck slides sideways
onto the centreline as one rigid body — the one lateral move that cannot
disturb a footprint, and the only one that reaches a pack pinned off-centre
by the tier below it. All six fixtures come out inside the placeholder
tolerances; anything a real job leaves over is reported, not hidden.
