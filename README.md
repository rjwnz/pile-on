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
isometric view of each truck, with the load checked against the NZ limits.

**Packer stages 1 and 2 of 6 are in.** The helix-aware packer works, and on the
benchmark fixtures it takes **12 trucks where the bounding-box control takes
19**.

That is the whole business case, and it comes from one observation: a pile is
not a cylinder of its widest diameter. A plate is a short fat band on a thin
shaft, so if two neighbouring lanes put their plates at different stations along
the deck they may close up from plate-to-plate pitch to plate-to-shaft. On a
168 mm shaft with a 450 mm plate that is 334 mm apart instead of 475 — a sixth
lane on a deck that fitted five.

Run `pnpm bench` for the table. `pnpm bench --save` records it, so the next run
shows what moved.

The packer also does three things the control never does: it mixes pile lengths
down a single lane, mixes types across a tier, and keeps every load balanced by
sliding tiers along the deck and turning alternate ones round.

**Stage 1** is what it rests on — the validator telling the whole truth, and the
numbers it judges against being settable and saved with the job:

- **Per-case clearances.** Shaft-to-shaft, helix-to-shaft and helix-to-helix are
  three separate figures. Helix-to-shaft is the one staggering exploits, so it
  is the one that decides how much there is to win.
- **Separation in three dimensions.** Piles rest on their widest point, so two
  diameters in one tier already sit at different heights. That vertical offset
  is clearance the lateral rule can spend.
- **The envelope.** Overhang against what each vehicle will actually carry, and
  the side margins, are enforced rather than assumed — see below.
- **Balance.** The load centre of mass against where the deck wants it, within a
  settable tolerance — see the caveat below.
- **Honest mass.** Bearers, chocks and lashings count against the payload.

`arrangeNaively` is still there and still the control: every pile a cylinder of
its widest diameter, one type per tier, nothing staggered or flipped. The
"Baseline instead" button runs it, and the packer reports what it saved against
it on every job. Being the control licenses it to pack badly, not illegally, so
it too fills from the middle of the deck outward and slides each load onto its
balance point.

Still to come: vertical interleaving (stage 3), multi-deck vehicles and the
solo-tractor rule (4), fleet selection and LNS (5), phases and early delivery
(6). Single phase only until then; the schedule is a quantity per pile type.

### Overhang

**Default zero: the load must fit on the deck.** Past the allowance is an
`over-rear-overhang` error, not a note, and the packer will not build one. Inside
it the plan says so — a warning, and past a metre a reminder that it needs flags
by day and lamps at night.

The allowance is set **per vehicle**, on the Vehicles tab, not in the loading
rules. VDAM states rear overhang as the lesser of a fixed distance and a fraction
of the axle spacing, so how far a load may hang out is a fact about a particular
unit rather than about a job — and it cannot be derived here, because axle
positions were deliberately scoped out. It is what the yard says this trailer
will carry.

Because it is easy to miss when it is somewhere else, the loading rules panel
shows the selected vehicle's figures read-only, and a truck carrying an overhang
gets a metric reading what it uses against what it is allowed. A truck with no
overhang and no allowance shows nothing — a column reading "0 of 0 mm" on every
truck is the noise that stops the one that matters being noticed.

### What the packer does not promise

Clashes, the envelope, support and payload are absolute — property-tested over
randomly generated catalogues, not just the cases someone thought to write down.

Two things are best-effort, and it is worth knowing which:

**Balance on awkward geometry.** It is a tolerance, not a fact about the steel.
The packer spends three separate repairs on it and then leaves any remaining
violation visible rather than hiding it. On five piles of wildly unequal mass and
length, the best reachable answer can sit outside a 200 mm tolerance.

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

Where a deck wants its load is the same kind of question. A semi wants mass
forward toward the kingpin and a rigid does not, so `balanceTarget` is left null
— "nobody has said" — and mid-deck is assumed until the yard gives a figure.

### CSV formats

Headers are case-insensitive and a block pasted from Excel works (tabs are
detected). Every importer offers merge or replace.

**Pile types.** Helices are flat numbered columns, because this catalogue is
maintained in a spreadsheet. Any number of helices works; the parser scans
`helix1_*`, `helix2_*`, … until they run out.

```
id,name,length,shaft_radius,mass,helix1_offset,helix1_radius,helix1_length
SP139-S4,SP139 4.5 m single helix,4500,70,96,350,175,90
```

`helixN_length` is the axial length of the helix — plate thickness plus the rise
of its flight — not the plate gauge. It decides whether two plates share a
station on the deck, so it is what makes staggering possible or not. The column
was once `helixN_thickness`; sheets using the old header still import.

**Vehicles.** A deck and a mass limit — no axle data.

```
id,name,kind,deck_length,deck_width,deck_height,tare,max_gross,max_front_overhang,max_rear_overhang,balance_target
SEMI-45,Tractor + 4-axle semi,semi_trailer,12500,2450,1350,15800,44000,0,1200,
```

`kind` is one of `rigid`, `semi_trailer`, `full_trailer`, `simple_trailer`,
`b_train`.

The last three columns are optional and default to the conservative reading —
no overhang either end, no opinion about where the load should sit — so a sheet
written before they existed still imports and still means what it meant. None of
them can be derived: VDAM states rear overhang against axle spacing, and where a
deck wants its load depends on where its axles are. A blank `balance_target`
means unstated, which is not the same as mid-deck.

**Piling schedule.** A quantity per pile type. Pile types must already exist in
the catalogue — a schedule naming an unknown type is rejected with the id, since
that is the most likely thing to be wrong with it. Repeated types are summed
rather than overwritten, because schedules routinely list a type once per
building or grid line.

```
pile_type_id,quantity
SP168-D6,120
SP139-S4,64
```

### Why there are no axle limits

Axle positions, tyre classes and the VDAM bridge formula were modelled and then
removed. In this operation the total payload limit is always reached before any
individual axle or axle-set limit, so the axle model cost real complexity —
including a deck-origin-to-axle coordinate mapping needed for the statics — to
enforce a constraint that never binds. **`maxGross − tare` is the mass
constraint.**

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
