import {describe, expect, it} from '@jest/globals';
import fc from 'fast-check';
import {pack} from './pack';
import {arrangeNaively} from './baseline';
import {DEFAULT_PACKING_OPTIONS, withoutFlips} from './options';
import {balanceOffset} from '../domain/balance';
import type {Catalogue} from '../domain/catalogue';
import type {Job} from '../domain/job';
import type {Helix, PileType} from '../domain/pile';
import type {Vehicle} from '../domain/vehicle';
import {validatePlan} from '../validation/plan';
import {SEMI, SP139, SP168, job} from '../testFixtures';

const CATALOGUE: Catalogue = {pileTypes: [SP168, SP139], vehicles: [SEMI]};
const OPTIONS = DEFAULT_PACKING_OPTIONS;

function errors(plan: ReturnType<typeof pack>['plan'], catalogue = CATALOGUE) {
  return validatePlan(plan, catalogue, OPTIONS).filter(
    violation => violation.severity === 'error',
  );
}

describe('what the packer is for', () => {
  it('closes up the lanes the bounding box keeps apart', () => {
    /*
     * The whole business case in one number. The naive arranger pitches lanes
     * at plate OD plus clearance — 475 mm — because it treats every pile as its
     * widest all the way along. Staggered so the plates miss each other, the
     * requirement drops to plate-against-shaft, 334 mm, and a sixth lane
     * appears on a deck that fitted five.
     */
    const {plan} = pack(job(['SP168-D6', 12]), CATALOGUE, OPTIONS);
    const bottom = plan.placements.filter(placement => placement.tier === 0);

    expect(new Set(bottom.map(placement => placement.y)).size).toBe(6);
    expect(bottom).toHaveLength(12);
  });

  it('uses fewer trucks than the baseline on a job that fills them', () => {
    const scheduled = job(['SP168-D6', 95]);
    const packed = pack(scheduled, CATALOGUE, OPTIONS);
    const naive = arrangeNaively(scheduled, CATALOGUE, OPTIONS);

    expect(packed.plan.consignments.length).toBeLessThan(
      naive.plan.consignments.length,
    );
  });

  it('bands every pack from a single pile type, which mixed tiers never did', () => {
    const {plan} = pack(
      job(['SP168-D6', 50], ['SP139-S4', 50]),
      CATALOGUE,
      OPTIONS,
    );

    const packs = new Map<string, Set<string>>();
    for (const placement of plan.placements) {
      const key = `${placement.consignmentId}:${placement.deck}:${placement.tier}:${placement.pack}`;
      packs.set(key, (packs.get(key) ?? new Set()).add(placement.pileTypeId));
    }

    expect(packs.size).toBeGreaterThan(0);
    for (const types of packs.values()) {
      expect(types.size).toBe(1);
    }
  });

  it('mixes extension lengths in one pack when banding them apart would strand one', () => {
    /*
     * Two lone extensions of one code, too unalike in weight to ride as a
     * side-by-side pair of packs (66 kg is half of 132 kg, under the 70%
     * floor). Banded into one mixed-length pack they lie side by side,
     * flush at the leading end, the short one tucked beside the long.
     */
    const short: PileType = {
      id: 'SS200-ext-3000',
      name: 'SS200 extension',
      length: 3000,
      shaftRadius: 70,
      mass: 66,
      helices: [],
    };
    const long: PileType = {
      id: 'SS200-ext-6000',
      name: 'SS200 extension',
      length: 6000,
      shaftRadius: 70,
      mass: 132,
      helices: [],
    };
    const catalogue: Catalogue = {pileTypes: [short, long], vehicles: [SEMI]};
    const {plan, unplaced} = pack(
      job(['SS200-ext-3000', 1], ['SS200-ext-6000', 1]),
      catalogue,
      OPTIONS,
    );

    expect(unplaced).toEqual([]);
    expect(plan.placements).toHaveLength(2);
    const [a, b] = plan.placements;
    expect(a!.tier).toBe(b!.tier);
    expect(a!.pack).toBe(b!.pack);
    expect(a!.x).toBe(b!.x);
    expect(a!.y).not.toBe(b!.y);
  });
});

describe('the packer never emits what the validator rejects', () => {
  it.each([
    ['one truck of one type', job(['SP168-D6', 40])],
    ['three trucks of one type', job(['SP168-D6', 95])],
    ['two types at once', job(['SP168-D6', 50], ['SP139-S4', 50])],
    ['a part-loaded truck', job(['SP168-D6', 13])],
    ['a single pile', job(['SP168-D6', 1])],
    ['short piles only', job(['SP139-S4', 60])],
  ])('%s', (_label, scheduled) => {
    const {plan} = pack(scheduled, CATALOGUE, OPTIONS);

    expect(errors(plan)).toEqual([]);
  });

  it('keeps every truck inside the balance tolerance', () => {
    const {plan} = pack(
      job(['SP168-D6', 50], ['SP139-S4', 50]),
      CATALOGUE,
      OPTIONS,
    );

    for (const consignment of plan.consignments) {
      const offset = balanceOffset(
        plan.placements.filter(p => p.consignmentId === consignment.id),
        CATALOGUE,
        SEMI,
      );
      expect(Math.abs(offset!.longitudinal)).toBeLessThanOrEqual(
        OPTIONS.balance.longitudinal,
      );
      expect(Math.abs(offset!.lateral)).toBeLessThanOrEqual(
        OPTIONS.balance.lateral,
      );
    }
  });
});

describe('accounting', () => {
  it('places exactly what was asked for, no more and no less', () => {
    const {plan, unplaced} = pack(
      job(['SP168-D6', 37], ['SP139-S4', 21]),
      CATALOGUE,
      OPTIONS,
    );

    expect(unplaced).toEqual([]);
    expect(
      plan.placements.filter(p => p.pileTypeId === 'SP168-D6'),
    ).toHaveLength(37);
    expect(
      plan.placements.filter(p => p.pileTypeId === 'SP139-S4'),
    ).toHaveLength(21);
  });

  it('gives every placement its own id', () => {
    const {plan} = pack(job(['SP168-D6', 60]), CATALOGUE, OPTIONS);
    const ids = plan.placements.map(placement => placement.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is deterministic', () => {
    const once = pack(job(['SP168-D6', 44]), CATALOGUE, OPTIONS);
    const twice = pack(job(['SP168-D6', 44]), CATALOGUE, OPTIONS);

    expect(twice.plan).toEqual(once.plan);
  });

  it('produces nothing at all for an empty job', () => {
    const {plan, unplaced} = pack(job(), CATALOGUE, OPTIONS);

    expect(plan.consignments).toEqual([]);
    expect(plan.placements).toEqual([]);
    expect(unplaced).toEqual([]);
  });

  it('ignores a zero quantity rather than opening a truck for it', () => {
    expect(
      pack(job(['SP168-D6', 0]), CATALOGUE, OPTIONS).plan.consignments,
    ).toEqual([]);
  });

  it('says nothing about a job line whose type is not in the catalogue', () => {
    // findDanglingReferences is what reports that; the packer just cannot act.
    const {plan, unplaced} = pack(job(['GHOST', 5]), CATALOGUE, OPTIONS);

    expect(plan.placements).toEqual([]);
    expect(unplaced).toEqual([]);
  });
});

describe('what will not fit', () => {
  it('reports a pile too long for the deck rather than looping', () => {
    const long: PileType = {...SP168, id: 'LONG', length: 14000};
    const {plan, unplaced} = pack(
      job(['LONG', 5]),
      {...CATALOGUE, pileTypes: [long]},
      OPTIONS,
    );

    expect(plan.placements).toEqual([]);
    expect(unplaced[0]!.reason).toContain('too long for the deck');
  });

  it('reports a pile too wide for the deck', () => {
    const wide: PileType = {
      ...SP168,
      id: 'WIDE',
      helices: [{offsetFromButt: 400, radius: 2000, length: 110}],
    };
    const {unplaced} = pack(
      job(['WIDE', 5]),
      {...CATALOGUE, pileTypes: [wide]},
      OPTIONS,
    );

    expect(unplaced[0]!.reason).toContain('too wide for the deck');
  });

  it('reports a pile too wide to band into a pack, even where the deck would take it', () => {
    // A 1.4 m plate fits a 2.45 m deck but no 1.2 m pack.
    const wide: PileType = {
      ...SP168,
      id: 'WIDE-PACK',
      helices: [{offsetFromButt: 400, radius: 700, length: 110}],
    };
    const {unplaced} = pack(
      job(['WIDE-PACK', 5]),
      {...CATALOGUE, pileTypes: [wide]},
      OPTIONS,
    );

    expect(unplaced[0]!.reason).toContain('too wide to band into a pack');
  });

  it('stops rather than opening trucks forever when nothing more fits', () => {
    // A payload that takes one pile and its bearers, and no more.
    const tiny: Vehicle = {...SEMI, payloadCapacity: 300};
    const {plan, unplaced} = pack(
      job(['SP168-D6', 4]),
      {...CATALOGUE, vehicles: [tiny]},
      OPTIONS,
    );

    expect(plan.consignments.length).toBeLessThanOrEqual(4);
    expect(
      plan.placements.length + unplaced.reduce((n, u) => n + u.quantity, 0),
    ).toBe(4);
  });
});

describe('flipping', () => {
  it('is off when the options say so', () => {
    const {plan} = pack(
      job(['SP168-D6', 40]),
      CATALOGUE,
      withoutFlips(OPTIONS),
    );

    expect(plan.placements.every(placement => !placement.flipped)).toBe(true);
  });

  it('still packs a legal load with flipping off', () => {
    const {plan} = pack(
      job(['SP168-D6', 95]),
      CATALOGUE,
      withoutFlips(OPTIONS),
    );

    expect(errors(plan)).toEqual([]);
  });

  it('never costs a truck, because the packer keeps the better of both', () => {
    /*
     * Not free by construction, which is why this is here. The sweep is greedy,
     * and a greedy search is not monotone in how many candidates it is offered:
     * more options change which lane wins at step one, and the new favourite is
     * occasionally the start of a worse tier. On the benchmark fixtures,
     * flipping saved a truck on one job and cost one on another until `pack`
     * started running it both ways and keeping the winner.
     */
    for (const scheduled of [
      job(['SP168-D6', 50], ['SP139-S4', 50]),
      job(['SP139-S4', 36], ['SP168-D6', 60]),
      job(['SP168-D6', 95]),
    ]) {
      const withFlips = pack(scheduled, CATALOGUE, OPTIONS);
      const without = pack(scheduled, CATALOGUE, withoutFlips(OPTIONS));

      expect(withFlips.plan.consignments.length).toBeLessThanOrEqual(
        without.plan.consignments.length,
      );
    }
  });
});

/*
 * Packing bugs are geometric, and geometry hides from example-based tests: the
 * cases that go wrong are the ones nobody thought to write down. These generate
 * the catalogue instead.
 */
describe('properties, over generated jobs', () => {
  const helix = (length: number): fc.Arbitrary<Helix> =>
    fc
      .record({
        offsetFromButt: fc.integer({min: 200, max: Math.floor(length / 2)}),
        radius: fc.integer({min: 90, max: 340}),
        length: fc.integer({min: 60, max: 200}),
      })
      .map(part => part as Helix);

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
    .array(
      fc.integer({min: 1, max: 30}).map(quantity => quantity),
      {minLength: 1, maxLength: 3},
    )
    .chain(quantities =>
      fc.tuple(
        fc.tuple(
          ...quantities.map((_, index) => pileType(`T${index}`)),
        ) as fc.Arbitrary<PileType[]>,
        fc.constant(quantities),
      ),
    );

  /*
   * Split deliberately, because the packer does not promise all of these
   * equally.
   *
   * Clashes, the envelope, support and payload are absolute: there is always
   * *some* legal arrangement, so emitting one that breaks them is a bug, and
   * this asserts it over generated geometry rather than over the cases someone
   * thought to write down.
   *
   * Balance is a tolerance, not a fact about the steel, and on a deliberately
   * awkward catalogue — five piles of wildly unequal mass and length — the best
   * reachable answer can sit outside a 200 mm one. The packer spends every lever
   * it has on it (`settleTiers`, `mirrorTiers`, `nudgeLanes`) and then reports
   * what is left rather than hiding it. `unbalanced` on a real job means the
   * plan needs a human; on these it means the tolerance is tighter than the
   * geometry allows.
   */
  const HARD_RULES = [
    'piles-clash',
    'over-payload',
    'over-height',
    'over-width',
    'unsupported',
    'over-rear-overhang',
    'ahead-of-headboard',
    'outside-side-margin',
    'pack-too-wide',
    'pack-mixed-type',
    'pack-not-flush',
    'too-many-packs',
    'packs-unbalanced',
    'unsupported-laterally',
  ];

  it('never clashes, overhangs, overloads or leaves a pile unsupported', () => {
    fc.assert(
      fc.property(scenario, ([types, quantities]) => {
        const catalogue: Catalogue = {pileTypes: types, vehicles: [SEMI]};
        const scheduled: Job = {
          name: 'generated',
          lines: types.map((type, index) => ({
            pileTypeId: type.id,
            quantity: quantities[index]!,
          })),
        };
        const {plan} = pack(scheduled, catalogue, OPTIONS);

        expect(
          validatePlan(plan, catalogue, OPTIONS).filter(violation =>
            HARD_RULES.includes(violation.rule),
          ),
        ).toEqual([]);
      }),
      {numRuns: 40},
    );
  });

  it('places every pile exactly once, or says why it could not', () => {
    fc.assert(
      fc.property(scenario, ([types, quantities]) => {
        const catalogue: Catalogue = {pileTypes: types, vehicles: [SEMI]};
        const scheduled: Job = {
          name: 'generated',
          lines: types.map((type, index) => ({
            pileTypeId: type.id,
            quantity: quantities[index]!,
          })),
        };
        const {plan, unplaced} = pack(scheduled, catalogue, OPTIONS);

        for (const [index, type] of types.entries()) {
          const placed = plan.placements.filter(
            placement => placement.pileTypeId === type.id,
          ).length;
          const reported = unplaced
            .filter(entry => entry.pileTypeId === type.id)
            .reduce((total, entry) => total + entry.quantity, 0);
          expect(placed + reported).toBe(quantities[index]!);
        }
      }),
      {numRuns: 60},
    );
  });

  /*
   * Not asserted over generated geometry, and the reason is worth stating.
   *
   * Both are heuristics, so on a catalogue nobody would ever buy — a 9 m pile
   * with a 476 mm plate beside a 3.3 m plain shaft — either can come out ahead.
   * What decides it there is not helix awareness but which one happens to trip
   * over the support rule first. Asserting it anyway would mean either chasing
   * cases that cannot occur or quietly weakening the packer to match the
   * control. The comparison that matters is on real catalogues, above, and in
   * `scripts/bench.ts` against real jobs.
   */
  it('places at least as many piles per truck as the baseline, on real geometry', () => {
    for (const quantity of [12, 25, 40, 60, 95]) {
      const scheduled = job(['SP168-D6', quantity]);
      const packed = pack(scheduled, CATALOGUE, OPTIONS);
      const naive = arrangeNaively(scheduled, CATALOGUE, OPTIONS);

      expect(packed.plan.consignments.length).toBeLessThanOrEqual(
        naive.plan.consignments.length,
      );
    }
  });
});

describe('the fleet', () => {
  const RIGID: Vehicle = {
    ...SEMI,
    id: 'RIGID-8',
    name: '8-wheeler rigid',
    kind: 'rigid',
    deckLength: 7200,
    payloadCapacity: 19400,
  };
  const TRAILER: Vehicle = {
    ...SEMI,
    id: 'TRAILER-4A',
    name: '4-axle full trailer',
    kind: 'full_trailer',
    deckLength: 8100,
    payloadCapacity: 15200,
    towableBy: ['RIGID-8'],
  };

  it('tows the trailer when it saves a movement', () => {
    // 60 piles need two solo runs of the rigid; with the trailer along, one
    // movement carries the lot.
    const fleet: Catalogue = {pileTypes: [SP139], vehicles: [RIGID, TRAILER]};
    const solo = pack(
      job(['SP139-S4', 60]),
      {
        pileTypes: [SP139],
        vehicles: [RIGID],
      },
      OPTIONS,
    );
    const towed = pack(job(['SP139-S4', 60]), fleet, OPTIONS);

    expect(towed.plan.consignments.length).toBeLessThan(
      solo.plan.consignments.length,
    );
    const withTrailer = towed.plan.consignments.filter(c => c.trailerId);
    expect(withTrailer.length).toBeGreaterThan(0);
    expect(
      towed.plan.placements.some(placement => placement.deck === 'trailer'),
    ).toBe(true);
  });

  it('leaves the trailer behind when the truck alone will do', () => {
    const fleet: Catalogue = {pileTypes: [SP139], vehicles: [RIGID, TRAILER]};
    const {plan} = pack(job(['SP139-S4', 4]), fleet, OPTIONS);

    expect(plan.consignments).toHaveLength(1);
    expect(plan.consignments[0]!.trailerId).toBeNull();
  });

  it('stamps every placement with the deck it was packed on', () => {
    const fleet: Catalogue = {pileTypes: [SP139], vehicles: [RIGID, TRAILER]};
    const {plan} = pack(job(['SP139-S4', 40]), fleet, OPTIONS);

    const ids = plan.placements.map(placement => placement.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const placement of plan.placements) {
      expect(placement.id).toContain(`-${placement.deck}-`);
    }
  });

  it('picks whichever truck fits the job, not just the first row', () => {
    // 9 m piles fit the semi and not the rigid, whatever order they are in.
    const long: PileType = {...SP168, id: 'LONG-9', length: 9000};
    const fleet: Catalogue = {pileTypes: [long], vehicles: [RIGID, SEMI]};
    const {plan, unplaced} = pack(job(['LONG-9', 6]), fleet, OPTIONS);

    expect(unplaced).toEqual([]);
    expect(plan.consignments.every(c => c.vehicleId === 'SEMI-45')).toBe(true);
  });

  it('reports demand no combination can take, naming the nearest miss', () => {
    const long: PileType = {...SP168, id: 'LONG-14', length: 14000};
    const fleet: Catalogue = {pileTypes: [long], vehicles: [RIGID, SEMI]};
    const {unplaced} = pack(job(['LONG-14', 3]), fleet, OPTIONS);

    expect(unplaced[0]!.reason).toContain('fits no vehicle in the fleet');
    expect(unplaced[0]!.reason).toContain('Tractor + 4-axle semi');
  });

  it('places nothing when the catalogue has only trailers', () => {
    const fleet: Catalogue = {pileTypes: [SP139], vehicles: [TRAILER]};
    const {plan, unplaced} = pack(job(['SP139-S4', 5]), fleet, OPTIONS);

    expect(plan.consignments).toEqual([]);
    expect(unplaced[0]!.reason).toBe(
      'no self-propelled truck in the catalogue',
    );
  });
});
