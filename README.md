# Pile-On

Load planning, optimisation and visual checking for steel screw piles on New
Zealand flat-deck transport. Given a piling plan and a fleet, work out how many
trucks of what type are needed, lay the piles out legally, and draw the result
so a human can check it before it goes on a quote.

Read [docs/00-problem-analysis.md](docs/00-problem-analysis.md) first — it covers
the problem structure, the NZ regulatory limits, what existing software does and
does not do, and the phased plan this repo is being built against.

## Status

Usable: the pile-type and vehicle catalogues, and the piling schedule — manual
entry and CSV import for all three, plus JSON export/import of a whole session.
The domain model, the helix separation rule and the NZ VDAM ruleset are
implemented and tested. **The packer is not written yet** — nothing produces a
load plan, so there is no plan view and no truck count.

Single phase only. Splitting a delivery across phases, and shipping early into
storage, are deferred; the schedule is a quantity per pile type, and phase will
become another field on the line when it lands.

### CSV formats

Headers are case-insensitive and a block pasted from Excel works (tabs are
detected). Both importers offer merge — update matching ids — or replace.

**Pile types.** Helices are flat numbered columns, because this catalogue is
maintained in a spreadsheet. Any number of helices works; the parser scans
`helix1_*`, `helix2_*`, … until they run out.

```
id,name,length,shaft_radius,mass,helix1_offset,helix1_radius,helix1_thickness
SP139-S4,SP139 4.5 m single helix,4500,70,96,350,175,90
```

**Vehicles.** A deck and a mass limit — no axle data.

```
id,name,kind,deck_length,deck_width,deck_height,tare,max_gross
SEMI-45,Tractor + 4-axle semi,semi_trailer,12500,2450,1350,15800,44000
```

`kind` is one of `rigid`, `semi_trailer`, `full_trailer`, `simple_trailer`,
`b_train`.

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

### Session files

Export writes catalogues *and* plan as one versioned JSON. Import makes you
choose: **catalogue only**, keeping the plan you are part-way through, or
**catalogue and plan**. A catalogue-only import can orphan the current plan, so
the app lists exactly which references broke rather than failing silently.

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

| Command | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server for the web app |
| `pnpm build` | Static production build into `apps/web/dist` |
| `pnpm test` | Jest across all workspaces |
| `pnpm test:coverage` | Jest with a combined coverage report in `coverage/` |
| `pnpm typecheck` | One `tsc` pass over the whole monorepo |
| `pnpm lint` / `pnpm fix` | GTS (Google TypeScript Style) via ESLint + Prettier |

To run one workspace: `pnpm --filter @pile-on/core test`.

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
