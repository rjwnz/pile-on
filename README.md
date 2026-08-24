# Pile-On

Load planning, optimisation and visual checking for steel screw piles on New
Zealand flat-deck transport. Given a piling plan and a fleet, work out how many
trucks of what type are needed, lay the piles out legally, and draw the result
so a human can check it before it goes on a quote.

Read [docs/00-problem-analysis.md](docs/00-problem-analysis.md) first — it covers
the problem structure, the NZ regulatory limits, what existing software does and
does not do, and the phased plan this repo is being built against. Then
[docs/01-packer-design.md](docs/01-packer-design.md), which is the build plan for
the packer and the six stages it lands in.

## Status

Usable end to end: the pile-type and vehicle catalogues, the piling schedule,
and a loading plan you can look at — exploded per-tier top-down drawings and an
isometric view of each deck, with the load checked against the NZ limits.

**Packer stages 1, 2 and the 4+5 core of 6 are in.** The helix-aware packer
works, and it packs onto a mixed fleet: every truck in the catalogue, each
towing up to one trailer (`towableBy` on the trailer row says which trucks
may). A truck and its trailer count as one movement, and each deck fills to
its own stated payload — there is no combined gross cap to share out. On the
benchmark fixtures the packer takes **19 movements where the bounding-box
control takes 27**. Still to come from stages 4-6: the solo-towing-unit cap, a
cost model, LNS repair, and phases.

That is the whole business case, and it comes from one observation: a pile is
not a cylinder of its widest diameter. A plate is a short fat band on a thin
shaft, so flipping alternate piles in a bundle puts their plates at opposite
ends and the bundle closes from plate-to-plate pitch to plate-to-shaft. On a
168 mm shaft with a 450 mm plate that is 334 mm apart instead of 475 — an
extra pile in every pack that fitted two.

Loads are built the way the yard actually bands and stacks them: **packs** —
single-type bundles of piles side by side, flush at the leading end, at most
1.2 m wide — laid in rows along the deck, at most two abreast, packs riding
abreast weighing alike within a settable ratio. Starters never share a pack
with extensions. A pile seats its shaft on single bearer timbers that touch
only shafts; bearer thickness is derived in 50 mm steps so every plate clears
everything below it, however many tiers down, and upper packs stand wholly on
the packs beneath at every station. Each deck gets a pack manifest — id,
contents, dimensions, mass, bearers — matching the labels on the drawings.
`docs/01-packer-design.md` §12 has the full rule set.

Run `pnpm bench` for the table. `pnpm bench --save` records it, so the next run
shows what moved.

The packer also does things the control never does: it flips piles within a
pack so their plates miss, mixes extension lengths in a pack when banding them
apart would strand one, and keeps every load balanced by sliding rows and
tiers along the deck and turning alternate tiers round. Head to tail is its
default: where two flip patterns band to the same width it takes the
alternating one, and the run carries on across the join between packs riding
abreast — the second pack is turned end for end unless that would widen it.

**Stage 1** is what it rests on — the validator telling the whole truth, and the
numbers it judges against being settable and saved with the job:

- **Per-case clearances.** Shaft-to-shaft, helix-to-shaft and helix-to-helix are
  three separate figures. Helix-to-shaft is the one staggering exploits, so it
  is the one that decides how much there is to win.
- **Separation in three dimensions.** Piles rest on their widest point, so two
  diameters in one tier already sit at different heights. That vertical offset
  is clearance the lateral rule can spend.
- **The envelope.** The load fits between headboard and tailgate, inside the
  side margins, with no overhang — enforced rather than assumed.
- **Balance.** The load centre of mass against where the deck wants it, within a
  settable tolerance — see the caveat below.
- **Honest mass.** Bearers, chocks and lashings count against the payload.

`arrangeNaively` is still there and still the control: every pile a cylinder of
its widest diameter, one type per tier, nothing staggered or flipped. The
"Baseline instead" button runs it, and the packer reports what it saved against
it on every job. Being the control licenses it to pack badly, not illegally, so
it too fills from the middle of the deck outward and slides each load onto its
balance point.

Still to come: vertical interleaving (stage 3), the solo-tractor rule and a
cost model (4/5 leftovers), LNS repair (5), phases and early delivery (6).
Single phase only until then; the schedule is a quantity per pile type.

### The envelope

**The load must fit on the deck.** A pile projecting past the tailgate is an
`over-rear-overhang` error, one ahead of the headboard is `ahead-of-headboard`,
and the packer will not build either. There is no per-vehicle overhang
allowance: VDAM states rear overhang against axle spacing, and axle positions
were deliberately scoped out, so there is no honest figure to hold a load
against. Zero is the reading that cannot be wrong in the unsafe direction.

Across the deck the side margin is a loading rule rather than a vehicle fact —
clear space kept between the steel and each edge — and a pile reaching into it
is `outside-side-margin`.

### What the packer does not promise

Clashes, the envelope, support and payload are absolute — property-tested over
randomly generated catalogues, not just the cases someone thought to write down.

Two things are best-effort, and it is worth knowing which:

**Balance on awkward geometry.** It is a tolerance, not a fact about the steel.
The packer spends its repairs on it — mirroring tiers, settling them along the
deck, shifting the whole load — and then leaves any remaining violation visible
rather than hiding it. On five piles of wildly unequal mass and length, the best
reachable answer can sit outside a 200 mm tolerance.

**Beating the baseline on _every_ catalogue.** Both are heuristics. On geometry
nobody would buy — a 9 m pile with a 476 mm plate next to a 3.3 m plain shaft —
either can come out ahead. The comparison that means anything is `pnpm bench`
against real jobs.

### The balance tolerance is a placeholder

Balance is not legally specified. It stands in for axle-set limits, the 20%
front-axle rule and the static roll threshold, and all three need the
deck-origin-to-axle mapping that was deliberately removed — so **no tolerance
here can be derived to guarantee legality**, and one that claims to would be
pretending.

The defaults are therefore tight rather than generous: 200 mm along the deck,
50 mm across it. Too tight rejects a legal load visibly and one conversation
fixes it; too loose accepts an illegal one silently and it reaches the road.
`docs/01-packer-design.md` §4.6 shows the ceilings that _are_ derivable and what
the real numbers should be measured against.

Where a deck wants its load is the same kind of question, and it got the same
answer: every load balances to **mid-deck**. A semi arguably wants mass forward
toward the kingpin and a rigid does not, but which and by how much needs the
axle geometry that is not modelled, so there is no per-vehicle target to set.

### CSV formats

Headers are case-insensitive and a block pasted from Excel works (tabs are
detected). Every importer offers merge or replace.

**Pile types.** A row is one shippable piece: a `pile_type` code and a `part`,
either `starter` or `extension`. The starter carries the helices; an extension
is plain shaft, so its helix columns are ignored. The catalogue id is built
from the two, so one pile type can list several extension lengths. Shaft and
plate sizes are entered as **diameters** — the figure stamped on the pile.

Helices are flat numbered columns, because this catalogue is maintained in a
spreadsheet. Any number of helices works; the parser scans `helix1_*`,
`helix2_*`, … until they run out.

```
pile_type,part,name,length,shaft_diameter,mass,helix1_offset,helix1_diameter,helix1_length
SP168,starter,,6000,168.3,196,400,450,131
SP168,extension,,3000,168.3,85,,,
```

`helixN_length` is the axial length of the helix — plate thickness plus the rise
of its flight — not the plate gauge. It decides whether two plates share a
station on the deck, so it is what makes staggering possible or not. The column
was once `helixN_thickness`; sheets using the old header still import.

**Vehicles.** A deck and a mass limit — no axle data. One row per unit; a
trailer is a row whose `towable_by` names the trucks allowed to tow it,
semicolon-separated.

```
id,name,kind,deck_length,deck_width,payload_capacity,towable_by
SEMI-45,Tractor + 4-axle semi,semi_trailer,12500,2450,28200,
RIGID-8,8-wheeler rigid,rigid,7200,2450,19400,
TRAILER-4A,4-axle full trailer,full_trailer,8100,2450,15200,RIGID-8
```

`kind` is one of `rigid`, `semi_trailer`, `full_trailer`, `simple_trailer`,
`b_train`, and is a label — `towable_by` is the field that decides what may
move with what. `payload_capacity` is the mass this deck may carry, piles,
bearers and lashings together: the operator states it directly, because it is
the only mass figure the packer and the rules ever consult.

**Piling schedule.** A quantity per pile type. Pile types must already exist in
the catalogue — a schedule naming an unknown type is rejected with the id, since
that is the most likely thing to be wrong with it. Repeated types are summed
rather than overwritten, because schedules routinely list a type once per
building or grid line.

```
pile_type_id,quantity
SP168-starter,120
SP168-ext-3000,84
```

### Why there are no axle limits

Axle positions, tyre classes and the VDAM bridge formula were modelled and then
removed. In this operation the total payload limit is always reached before any
individual axle or axle-set limit, so the axle model cost real complexity —
including a deck-origin-to-axle coordinate mapping needed for the statics — to
enforce a constraint that never binds. **The deck's stated payload capacity is
the mass constraint.**

Even distribution is still required. It is a load-balance question — centroid
against the deck centre and the centreline — and does not need axle geometry.

If the assumption stops holding (much heavier piles, shorter-wheelbase units),
the limits come back as a new `VdamRuleset` version, not as an edit to the
current one. The tables are in
[docs/00-problem-analysis.md](docs/00-problem-analysis.md).

### Session files

Export writes the whole session — catalogues, schedule, loading rules and plan —
as one versioned JSON. Import makes you choose: **catalogue only**, keeping the
schedule, rules and plan you are part-way through, or **everything**. A
catalogue-only import can orphan the schedule, so the app lists exactly which
references broke rather than failing silently.

The loading rules travel in the file for the same reason the ruleset version
does: a quote priced at a 25 mm helix clearance and a 200 mm balance tolerance
cannot be re-explained six months later unless the file says so.

## Layout

```
packages/core   @pile-on/core — domain, geometry, NZ rules, solver. No DOM, no React.
apps/web        @pile-on/web  — the static site. Vite + React + Tailwind.
docs/           analysis and decisions
```

`core` is deliberately separate and framework-free so the same engine can back a
CLI, a batch quoting job or a server later without dragging the UI along. The web
app aliases `@pile-on/core` straight at its TypeScript source, so there is no
build ordering to get wrong and HMR works across the package boundary.

## Commands

Everything runs from the repo root.

```bash
pnpm install
```

```bash
pnpm dev
```

```bash
pnpm check
```

`pnpm check` is the one that matters — it runs typecheck, lint and tests with
coverage, and is what CI runs.

| Command                  | What it does                                                    |
| ------------------------ | --------------------------------------------------------------- |
| `pnpm dev`               | Vite dev server for the web app                                 |
| `pnpm build`             | Static production build into `apps/web/dist`                    |
| `pnpm test`              | Jest across all workspaces, hunts excluded                      |
| `pnpm test:coverage`     | Jest with a combined coverage report in `coverage/`             |
| `pnpm hunt`              | The randomised property searches, on purpose and on their own   |
| `pnpm typecheck`         | One `tsc` pass over the whole monorepo                          |
| `pnpm lint` / `pnpm fix` | GTS (Google TypeScript Style) via ESLint + Prettier             |
| `pnpm bench`             | Trucks used and deck utilisation per fixture, packer vs control |

To run one workspace: `pnpm --filter @pile-on/core test`.

### Hunts

A file named `*.hunt.test.ts` is a hunt: a randomised property search that
draws a fresh seed every run and spends thousands of them looking for inputs
nobody thought to write down. The packer's picometre rounding bug was found by
one.

They are left out of `pnpm test` and therefore out of CI, because they are the
opposite of a gate. A green hunt is evidence, not proof; a red one may not
reproduce; and either takes minutes. Run them when you mean to, with `pnpm
hunt`, and when one does find something, pin it with an ordinary test next to
the code it broke.

## Conventions

**Units.** Every length is millimetres, every mass is kilograms, everywhere below
the presentation layer. Pile and deck dimensions are whole millimetres, so the
geometry stays in exactly-representable integers. Conversion to metres and tonnes
is a rendering concern.

**One source of truth for legality.** Anything that decides whether a load plan is
legal lives in `core` and is called by both the optimiser and the manual editor.
The UI and the solver must never be able to disagree about what is allowed.

**Rules are versioned data.** NZ transport limits change — NZTA removed 50MAX
permits on 6 August 2026, with further VDAM phases from October 2026. Limits live
in `packages/core/src/rules/` with a version and an effective date, and every
saved quote records which ruleset produced it. Add a new version alongside the
old one rather than editing in place.

**The tier plans are SVG; the 3D view is WebGL.** They are different jobs. The
tier plans are what a load is checked against, so they are vector: exact,
printable, snapshot-testable. The 3D view only has to convey the shape of the
load, and it went through three attempts at sorting shapes back to front — by
`x + y`, then by tier, then a topological sort over pairwise occlusion — each of
which fixed one family of artefacts and left another. A correct draw order does
not reliably exist for overlapping solids. A depth buffer settles visibility per
pixel, so the question stops arising. three.js is lazy-loaded, since plenty of
sessions never leave the catalogue tabs.

**Tests are the deliverable, not an afterthought.** `core` is held to 95% coverage
and currently sits at 100%. Geometry bugs hide well from example-based tests, so
prefer boundary cases and, as the packer lands, property tests: no two piles ever
overlap, no plan ever violates `validate()`, every pile appears exactly once.

## Toolchain notes

**TypeScript is pinned to 5.9.3.** Not an oversight. TypeScript 7 is out, but
`typescript-eslint` 8 (which gts 7 bundles) supports `<6.1.0` and `ts-jest`
supports `<7`, so TS 7 would break both linting and tests. Revisit once those
two catch up.

**ESLint is 9.x, not 10.** gts 7 depends on `eslint@^9.37.0`; pinning the same
major at the root keeps a single ESLint instance so plugin instances match.

**ts-jest, not @swc/jest.** Slower, but coverage instrumentation via istanbul is
more reliable than the V8 provider, and coverage is load-bearing here. If test
runtime becomes a problem, swapping the transform is a two-line change per
`jest.config.cjs` — set `coverageProvider: 'v8'` at the same time.
