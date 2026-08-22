# Pile-On

Load planning, optimisation and visual checking for steel screw piles on New
Zealand flat-deck transport. Given a piling plan and a fleet, work out how many
trucks of what type are needed, lay the piles out legally, and draw the result
so a human can check it before it goes on a quote.

Read [docs/00-problem-analysis.md](docs/00-problem-analysis.md) first — it covers
the problem structure, the NZ regulatory limits, what existing software does and
does not do, and the phased plan this repo is being built against.

## Status

Skeleton. The domain model, the helix separation rule and the NZ VDAM ruleset are
implemented and tested. The packer is not written yet.

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
