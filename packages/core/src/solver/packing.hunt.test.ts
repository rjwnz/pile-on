import {expect, it} from '@jest/globals';
import fc from 'fast-check';
import {pack} from './pack';
import {DEFAULT_PACKING_OPTIONS} from './options';
import {validatePlan} from '../validation/plan';
import type {Catalogue} from '../domain/catalogue';
import type {Job} from '../domain/job';
import type {Helix, PileType} from '../domain/pile';
import type {Vehicle} from '../domain/vehicle';

const SEMI: Vehicle = {
  id: 'SEMI-45',
  name: 's',
  kind: 'semi_trailer',
  deckLength: 12500,
  deckWidth: 2450,
  deckHeight: 1350,
  tare: 15800,
  maxGross: 44000,
  maxFrontOverhang: 0,
  maxRearOverhang: 0,
  balanceTarget: null,
  towableBy: [],
};
const OPTIONS = DEFAULT_PACKING_OPTIONS;
const HARD = [
  'piles-clash',
  'over-payload',
  'over-height',
  'over-width',
  'unsupported',
  'over-rear-overhang',
  'ahead-of-headboard',
  'outside-side-margin',
];

const helix = (length: number): fc.Arbitrary<Helix> =>
  fc
    .record({
      offsetFromButt: fc.integer({min: 200, max: Math.floor(length / 2)}),
      radius: fc.integer({min: 90, max: 340}),
      length: fc.integer({min: 60, max: 200}),
    })
    .map(p => p as Helix);
const pileType = (id: string): fc.Arbitrary<PileType> =>
  fc.integer({min: 3000, max: 9000}).chain(length =>
    fc.record({
      id: fc.constant(id),
      name: fc.constant(id),
      length: fc.constant(length),
      shaftRadius: fc.integer({min: 50, max: 89}),
      mass: fc.integer({min: 40, max: 400}),
      helices: fc.array(helix(length), {minLength: 0, maxLength: 2}),
    }),
  );
const scenario = fc
  .array(fc.integer({min: 1, max: 30}), {minLength: 1, maxLength: 3})
  .chain(q =>
    fc.tuple(
      fc.tuple(...q.map((_, i) => pileType(`T${i}`))) as fc.Arbitrary<
        PileType[]
      >,
      fc.constant(q),
    ),
  );

it('hunts hard-rule violations over many seeds', () => {
  fc.assert(
    fc.property(scenario, ([types, quantities]) => {
      const catalogue: Catalogue = {pileTypes: types, vehicles: [SEMI]};
      const job: Job = {
        name: 'g',
        lines: types.map((t, i) => ({
          pileTypeId: t.id,
          quantity: quantities[i]!,
        })),
      };
      const {plan, unplaced} = pack(job, catalogue, SEMI, OPTIONS);
      expect(
        validatePlan(plan, catalogue, OPTIONS).filter(v =>
          HARD.includes(v.rule),
        ),
      ).toEqual([]);
      for (const [i, t] of types.entries()) {
        const placed = plan.placements.filter(
          p => p.pileTypeId === t.id,
        ).length;
        const reported = unplaced
          .filter(u => u.pileTypeId === t.id)
          .reduce((n, u) => n + u.quantity, 0);
        expect(placed + reported).toBe(quantities[i]!);
      }
    }),
    {numRuns: 1200},
  );
}, 600000);
