import {describe, expect, it} from '@jest/globals';
import {arrangeNaively, cellsFor, lanesFor, pilesPerLane} from './baseline';
import {validatePlan} from '../validation/plan';
import {balanceOffset} from '../domain/balance';
import {DEFAULT_LOADING_OPTIONS} from '../domain/loading';
import type {Catalogue} from '../domain/catalogue';
import type {Job} from '../domain/job';
import type {PileType} from '../domain/pile';
import type {Vehicle} from '../domain/vehicle';

const SP168: PileType = {
  id: 'SP168-D6',
  name: 'SP168 6.0 m twin helix',
  length: 6000,
  shaftRadius: 84,
  mass: 178,
  helices: [
    {offsetFromButt: 400, radius: 225, length: 110},
    {offsetFromButt: 1100, radius: 175, length: 110},
  ],
};

const SP139: PileType = {
  id: 'SP139-S4',
  name: 'SP139 4.5 m single helix',
  length: 4500,
  shaftRadius: 70,
  mass: 96,
  helices: [{offsetFromButt: 350, radius: 175, length: 90}],
};

const SEMI: Vehicle = {
  id: 'SEMI-45',
  name: 'Semi',
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

const CATALOGUE: Catalogue = {pileTypes: [SP168, SP139], vehicles: [SEMI]};
const OPTIONS = DEFAULT_LOADING_OPTIONS;

function job(...lines: [string, number][]): Job {
  return {
    name: 'test',
    lines: lines.map(([pileTypeId, quantity]) => ({pileTypeId, quantity})),
  };
}

describe('lanesFor', () => {
  it('spaces lanes at the bounding-box pitch, not the staggered pitch', () => {
    // 450 mm plate OD + 25 mm clearance = 475 mm pitch. The helix-aware packer
    // gets 334 mm here; that gap is the whole point of keeping this baseline.
    const lanes = lanesFor(SEMI, SP168, OPTIONS);

    expect(lanes).toHaveLength(5);
    expect(lanes.map(lane => lane.y)).toEqual([-950, -475, 0, 475, 950]);
  });

  it('centres the lanes on the deck', () => {
    const lanes = lanesFor(SEMI, SP139, OPTIONS);
    const ys = lanes.map(lane => lane.y);

    expect(ys[0]).toBe(-ys[ys.length - 1]!);
  });

  it('keeps the outermost pile inside the side margins', () => {
    const lanes = lanesFor(SEMI, SP168, OPTIONS);
    const outermost = Math.max(...lanes.map(lane => Math.abs(lane.y))) + 225;

    expect(outermost).toBeLessThanOrEqual(
      SEMI.deckWidth / 2 - OPTIONS.sideMargin,
    );
  });

  it('gives no lanes at all for a pile wider than the deck', () => {
    const huge: PileType = {
      ...SP168,
      helices: [{offsetFromButt: 400, radius: 2000, length: 110}],
    };

    expect(lanesFor(SEMI, huge, OPTIONS)).toEqual([]);
  });
});

describe('pilesPerLane', () => {
  it('fits two 6 m piles end to end on a 12.5 m deck', () => {
    // 12500 − 100 headboard = 12400 usable; 2 × 6000 + 100 gap = 12100.
    expect(pilesPerLane(SEMI, SP168, OPTIONS)).toBe(2);
  });

  it('fits two 4.5 m piles, not three, once gaps are counted', () => {
    // 3 × 4500 + 2 × 100 = 13700 > 12400.
    expect(pilesPerLane(SEMI, SP139, OPTIONS)).toBe(2);
  });

  it('is zero for a pile longer than the deck', () => {
    expect(pilesPerLane(SEMI, {...SP168, length: 14000}, OPTIONS)).toBe(0);
  });
});

describe('arrangeNaively', () => {
  it('produces nothing for an empty job', () => {
    const {plan, unplaced} = arrangeNaively(job(), CATALOGUE, OPTIONS);

    expect(plan.consignments).toEqual([]);
    expect(plan.placements).toEqual([]);
    expect(unplaced).toEqual([]);
  });

  it('fills one tier before opening the next', () => {
    // 5 lanes × 2 piles = 10 per tier.
    const {plan} = arrangeNaively(job(['SP168-D6', 10]), CATALOGUE, OPTIONS);

    expect(plan.placements).toHaveLength(10);
    expect(new Set(plan.placements.map(p => p.tier))).toEqual(new Set([0]));
    expect(plan.consignments).toHaveLength(1);
  });

  it('opens a second tier once the first is full', () => {
    const {plan} = arrangeNaively(job(['SP168-D6', 11]), CATALOGUE, OPTIONS);

    expect(plan.placements.filter(p => p.tier === 0)).toHaveLength(10);
    expect(plan.placements.filter(p => p.tier === 1)).toHaveLength(1);
  });

  it('places every pile it is given', () => {
    const {plan, unplaced} = arrangeNaively(
      job(['SP168-D6', 37], ['SP139-S4', 21]),
      CATALOGUE,
      OPTIONS,
    );

    expect(unplaced).toEqual([]);
    expect(plan.placements).toHaveLength(58);
  });

  it('gives each tier over to a single pile type', () => {
    const {plan} = arrangeNaively(
      job(['SP168-D6', 10], ['SP139-S4', 10]),
      CATALOGUE,
      OPTIONS,
    );

    for (const consignment of plan.consignments) {
      const tiers = new Map<string, Set<string>>();
      for (const placement of plan.placements.filter(
        p => p.consignmentId === consignment.id,
      )) {
        const key = String(placement.tier);
        tiers.set(key, (tiers.get(key) ?? new Set()).add(placement.pileTypeId));
      }
      for (const types of tiers.values()) {
        expect(types.size).toBe(1);
      }
    }
  });

  it('opens a second truck when the tier limit is reached', () => {
    // 4 tiers × 10 = 40 per truck.
    const {plan} = arrangeNaively(job(['SP168-D6', 41]), CATALOGUE, OPTIONS);

    expect(plan.consignments).toHaveLength(2);
    expect(plan.placements.filter(p => p.consignmentId === 'C1')).toHaveLength(
      40,
    );
    expect(plan.placements.filter(p => p.consignmentId === 'C2')).toHaveLength(
      1,
    );
  });

  it('opens a second truck when the payload runs out', () => {
    // 3 t payload takes 16 × 178 kg = 2,848 kg; the 17th would be 3,026 kg.
    const light: Vehicle = {...SEMI, tare: 41000, maxGross: 44000};
    const {plan} = arrangeNaively(
      job(['SP168-D6', 20]),
      {...CATALOGUE, vehicles: [light]},
      OPTIONS,
    );

    expect(plan.consignments.length).toBeGreaterThan(1);
    expect(plan.placements).toHaveLength(20);
  });

  it('stops adding tiers at the height limit', () => {
    // A 2 m deck leaves 2.3 m; each SP168 tier is 100 + 450 = 550 mm, so 4 fit
    // — but maxTiers caps it at 4 anyway, so lower the deck ceiling instead.
    const tall: Vehicle = {...SEMI, deckHeight: 3200};
    const {plan} = arrangeNaively(
      job(['SP168-D6', 40]),
      {...CATALOGUE, vehicles: [tall]},
      OPTIONS,
    );

    // 4300 − 3200 = 1100 mm available, so two 550 mm tiers per truck.
    const tiersOnFirst = new Set(
      plan.placements.filter(p => p.consignmentId === 'C1').map(p => p.tier),
    );
    expect(tiersOnFirst.size).toBe(2);
  });

  it('reports a pile too long for the deck instead of looping', () => {
    const long: PileType = {...SP168, id: 'LONG', length: 14000};
    const {plan, unplaced} = arrangeNaively(
      job(['LONG', 5]),
      {...CATALOGUE, pileTypes: [long]},
      OPTIONS,
    );

    expect(plan.placements).toEqual([]);
    expect(unplaced).toEqual([
      {
        pileTypeId: 'LONG',
        quantity: 5,
        reason:
          'fits no vehicle in the fleet — best case (Semi): too long for the deck — 14000 mm on a 12500 mm deck',
      },
    ]);
  });

  it('reports a pile too wide for the deck', () => {
    const wide: PileType = {
      ...SP168,
      id: 'WIDE',
      helices: [{offsetFromButt: 400, radius: 2000, length: 110}],
    };
    const {unplaced} = arrangeNaively(
      job(['WIDE', 3]),
      {...CATALOGUE, pileTypes: [wide]},
      OPTIONS,
    );

    expect(unplaced[0]!.reason).toMatch(/too wide for the deck/);
  });

  it('reports a pile heavier than the whole payload', () => {
    const heavy: PileType = {...SP168, id: 'HEAVY', mass: 40000};
    const {unplaced} = arrangeNaively(
      job(['HEAVY', 1]),
      {...CATALOGUE, pileTypes: [heavy]},
      OPTIONS,
    );

    expect(unplaced[0]!.reason).toMatch(/over the 28,?200 kg payload/);
  });

  it('skips a job line naming a pile type that is not in the catalogue', () => {
    const {plan, unplaced} = arrangeNaively(
      job(['GHOST', 5]),
      CATALOGUE,
      OPTIONS,
    );

    // findDanglingReferences is what reports this; the arranger just cannot act.
    expect(plan.placements).toEqual([]);
    expect(unplaced).toEqual([]);
  });

  it('gives every placement a unique, deterministic id', () => {
    const first = arrangeNaively(job(['SP168-D6', 25]), CATALOGUE, OPTIONS);
    const second = arrangeNaively(job(['SP168-D6', 25]), CATALOGUE, OPTIONS);

    const ids = first.plan.placements.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(second.plan.placements.map(p => p.id)).toEqual(ids);
  });

  /*
   * `headboardGap` is where the arranger starts laying piles, not a bound it
   * has to hold. Balancing the load may spend some of it, and that is allowed:
   * the Truck Loading Code has the front tier butted up to the headboard for
   * pipe loads. What may never happen is a pile projecting *past* the headboard
   * on a vehicle whose yard has not allowed a front overhang.
   */
  it('never projects a pile past the headboard', () => {
    const {plan} = arrangeNaively(job(['SP168-D6', 25]), CATALOGUE, OPTIONS);

    for (const placement of plan.placements) {
      expect(placement.x).toBeGreaterThanOrEqual(-SEMI.maxFrontOverhang);
    }
  });

  it('stays within the rear overhang the vehicle allows', () => {
    const {plan} = arrangeNaively(job(['SP168-D6', 25]), CATALOGUE, OPTIONS);

    for (const placement of plan.placements) {
      expect(placement.x + SP168.length).toBeLessThanOrEqual(
        SEMI.deckLength + SEMI.maxRearOverhang,
      );
    }
  });

  it('leaves every truck it builds balanced', () => {
    // A part-loaded last truck is the case that goes wrong: full tiers balance
    // themselves, a truncated one does not.
    const {plan} = arrangeNaively(job(['SP168-D6', 95]), CATALOGUE, OPTIONS);

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

  it('fits the same number of piles per truck as filling row by row would', () => {
    // The centre-out fill order exists for balance, not for capacity. If it
    // ever changed how much fits, it would be quietly rewriting the control.
    const cells = cellsFor(SEMI, SP168, OPTIONS);
    const lanes = lanesFor(SEMI, SP168, OPTIONS);

    expect(cells).toHaveLength(
      lanes.length * pilesPerLane(SEMI, SP168, OPTIONS),
    );
    expect(new Set(cells.map(c => `${c.x}:${c.y}`)).size).toBe(cells.length);
  });
});

describe('arrangeNaively with a trailer in the fleet', () => {
  const RIGID: Vehicle = {
    ...SEMI,
    id: 'RIGID-8',
    name: 'Rigid',
    kind: 'rigid',
    deckLength: 7200,
    deckHeight: 1200,
    tare: 10600,
    maxGross: 30000,
  };
  const TRAILER: Vehicle = {
    ...SEMI,
    id: 'TRAILER-4A',
    name: 'Trailer',
    kind: 'full_trailer',
    deckLength: 8100,
    deckHeight: 1150,
    tare: 6800,
    maxGross: 22000,
    towableBy: ['RIGID-8'],
  };
  const FLEET: Catalogue = {
    pileTypes: [SP168, SP139],
    vehicles: [RIGID, TRAILER],
  };

  it('always sends the biggest combination it owns', () => {
    const {plan} = arrangeNaively(job(['SP139-S4', 10]), FLEET, OPTIONS);

    // Deterministically rigid + trailer, even for a load the truck alone
    // would take: the control is naive on purpose.
    expect(plan.consignments[0]!.vehicleId).toBe('RIGID-8');
    expect(plan.consignments[0]!.trailerId).toBe('TRAILER-4A');
  });

  it('fills the trailer deck once the truck deck is full', () => {
    const {plan, unplaced} = arrangeNaively(
      job(['SP139-S4', 60]),
      FLEET,
      OPTIONS,
    );

    expect(unplaced).toEqual([]);
    expect(plan.placements.some(p => p.deck === 'trailer')).toBe(true);
    expect(plan.placements.length).toBe(60);
  });

  it('emits a plan the validator accepts, both decks included', () => {
    const {plan} = arrangeNaively(
      job(['SP168-D6', 30], ['SP139-S4', 30]),
      FLEET,
      OPTIONS,
    );

    expect(
      validatePlan(plan, FLEET, OPTIONS).filter(v => v.severity === 'error'),
    ).toEqual([]);
  });

  it('is deterministic across runs', () => {
    const first = arrangeNaively(job(['SP139-S4', 45]), FLEET, OPTIONS);
    const second = arrangeNaively(job(['SP139-S4', 45]), FLEET, OPTIONS);

    expect(second.plan).toEqual(first.plan);
  });

  it('reports everything unplaced when the catalogue is only trailers', () => {
    const {plan, unplaced} = arrangeNaively(
      job(['SP139-S4', 5]),
      {pileTypes: [SP139], vehicles: [TRAILER]},
      OPTIONS,
    );

    expect(plan.consignments).toEqual([]);
    expect(unplaced[0]!.reason).toBe(
      'no self-propelled truck in the catalogue',
    );
  });
});
