import {describe, expect, it} from '@jest/globals';
import {consignmentMass, loadWidth, validatePlan} from './plan';
import {DEFAULT_LOADING_OPTIONS} from '../domain/loading';
import {arrangeNaively} from '../solver/baseline';
import type {Catalogue, LoadPlan} from '../domain/catalogue';
import type {Job} from '../domain/job';
import type {PileType} from '../domain/pile';
import type {Placement} from '../domain/placement';
import type {Vehicle} from '../domain/vehicle';

const SP168: PileType = {
  id: 'SP168-D6',
  name: 'SP168',
  length: 6000,
  shaftRadius: 84,
  mass: 178,
  helices: [
    {offsetFromButt: 400, radius: 225, thickness: 110},
    {offsetFromButt: 1100, radius: 175, thickness: 110},
  ],
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
};

const CATALOGUE: Catalogue = {pileTypes: [SP168], vehicles: [SEMI]};
const OPTIONS = DEFAULT_LOADING_OPTIONS;

function place(overrides: Partial<Placement> = {}): Placement {
  return {
    id: 'PL-1',
    consignmentId: 'C1',
    pileTypeId: 'SP168-D6',
    tier: 0,
    x: 100,
    y: 0,
    flipped: false,
    ...overrides,
  };
}

function planWith(placements: Placement[]): LoadPlan {
  return {
    consignments: [{id: 'C1', vehicleId: 'SEMI-45', phase: null}],
    placements,
  };
}

function rules(plan: LoadPlan, catalogue = CATALOGUE): string[] {
  return validatePlan(plan, catalogue, OPTIONS).map(v => v.rule);
}

describe('the arranger and the validator agree', () => {
  it('accepts everything the naive arranger produces', () => {
    const job: Job = {
      name: 'j',
      lines: [{pileTypeId: 'SP168-D6', quantity: 95}],
    };
    const {plan} = arrangeNaively(job, CATALOGUE, SEMI, OPTIONS);

    expect(plan.consignments.length).toBeGreaterThan(1);
    expect(validatePlan(plan, CATALOGUE, OPTIONS)).toEqual([]);
  });

  it('accepts a lane pitch that is exactly the required separation', () => {
    // The arranger packs lanes at precisely helix-OD + clearance. Floating
    // point must not turn "exactly enough" into a clash.
    const plan = planWith([
      place({id: 'a', y: 0}),
      place({id: 'b', y: 225 + 225 + OPTIONS.clearance}),
    ]);

    expect(rules(plan)).toEqual([]);
  });
});

describe('mass', () => {
  it('flags a load over the payload', () => {
    const many = Array.from({length: 200}, (_, i) =>
      place({id: `p${i}`, tier: i, y: 0}),
    );

    expect(rules(planWith(many))).toContain('over-payload');
  });

  it('says by how much', () => {
    const many = Array.from({length: 200}, (_, i) =>
      place({id: `p${i}`, tier: i, y: 0}),
    );
    const violation = validatePlan(planWith(many), CATALOGUE, OPTIONS).find(
      v => v.rule === 'over-payload',
    );

    // 200 × 178 = 35,600 against a 28,200 kg payload, so 7,400 kg over.
    expect(violation!.message).toMatch(/35,600 kg/);
    expect(violation!.message).toMatch(/28,200 kg payload/);
    expect(violation!.message).toMatch(/by 7,400 kg/);
  });

  it('totals only the piles it can resolve', () => {
    expect(
      consignmentMass(
        [place({id: 'a'}), place({id: 'b', pileTypeId: 'GHOST'})],
        CATALOGUE,
      ),
    ).toBe(178);
  });
});

describe('height', () => {
  it('accepts a load inside the 4.3 m limit', () => {
    const plan = planWith([place({tier: 0}), place({id: 'b', tier: 1})]);

    expect(rules(plan)).not.toContain('over-height');
  });

  it('flags a load over the height limit', () => {
    // 1350 deck + 6 tiers × 550 = 4650.
    const stacked = Array.from({length: 6}, (_, tier) =>
      place({id: `t${tier}`, tier}),
    );

    expect(rules(planWith(stacked))).toContain('over-height');
  });
});

describe('width', () => {
  it('measures the widest point, plates included', () => {
    expect(loadWidth([place({y: 900})], CATALOGUE)).toBe((900 + 225) * 2);
  });

  it('flags a load over the legal width', () => {
    const plan = planWith([place({y: 1100})]);

    expect(rules(plan)).toContain('over-width');
  });

  it('warns about a load wider than the deck but still legal', () => {
    // |1000| + 225 = 1225 each side → 2450 wide. Legal at 2550, but it is the
    // full deck width, so anything past it hangs over the edge.
    const plan = planWith([place({y: 1010})]);
    const found = rules(plan);

    expect(found).toContain('overhangs-side');
    expect(found).not.toContain('over-width');
  });
});

describe('deck bounds', () => {
  it('warns when a pile hangs off the back', () => {
    const plan = planWith([place({x: 7000})]);
    const violation = validatePlan(plan, CATALOGUE, OPTIONS)[0];

    expect(violation!.rule).toBe('rear-overhang');
    expect(violation!.severity).toBe('warning');
    expect(violation!.message).toContain('500 mm');
  });

  it('mentions flags and lamps once the overhang passes a metre', () => {
    const plan = planWith([place({x: 8000})]);

    expect(validatePlan(plan, CATALOGUE, OPTIONS)[0]!.message).toContain(
      'flags by day and lamps at night',
    );
  });

  it('flags a pile placed ahead of the headboard', () => {
    expect(rules(planWith([place({x: -50})]))).toContain('ahead-of-headboard');
  });
});

describe('clashes', () => {
  it('flags two piles too close in the same tier', () => {
    const plan = planWith([place({id: 'a', y: 0}), place({id: 'b', y: 300})]);
    const violation = validatePlan(plan, CATALOGUE, OPTIONS)[0];

    expect(violation!.rule).toBe('piles-clash');
    expect(violation!.message).toBe('a and b are 300 mm apart but need 475 mm');
  });

  it('ignores piles in different tiers', () => {
    const plan = planWith([
      place({id: 'a', tier: 0, y: 0}),
      place({id: 'b', tier: 1, y: 0}),
    ]);

    expect(rules(plan)).toEqual([]);
  });

  it('ignores piles that never share a station along the deck', () => {
    const plan = planWith([
      place({id: 'a', x: 100, y: 0}),
      place({id: 'b', x: 6200, y: 0}),
    ]);

    expect(rules(plan)).toEqual([]);
  });
});

describe('broken references', () => {
  it('flags a consignment whose vehicle is gone', () => {
    const plan = planWith([place()]);

    expect(rules(plan, {pileTypes: [SP168], vehicles: []})).toEqual([
      'unknown-vehicle',
    ]);
  });

  it('flags a placement whose pile type is gone', () => {
    const plan = planWith([place({pileTypeId: 'GHOST'})]);

    expect(rules(plan)).toContain('unknown-pile-type');
  });

  it('flags placements pointing at a consignment that is not in the plan', () => {
    const plan: LoadPlan = {
      consignments: [{id: 'C1', vehicleId: 'SEMI-45', phase: null}],
      placements: [place({consignmentId: 'C9'})],
    };

    expect(rules(plan)).toContain('unknown-consignment');
  });
});

describe('multiple consignments', () => {
  it('checks each truck on its own placements', () => {
    const plan: LoadPlan = {
      consignments: [
        {id: 'C1', vehicleId: 'SEMI-45', phase: null},
        {id: 'C2', vehicleId: 'SEMI-45', phase: null},
      ],
      placements: [
        place({id: 'a', consignmentId: 'C1', y: 0}),
        place({id: 'b', consignmentId: 'C1', y: 300}),
        place({id: 'c', consignmentId: 'C2', y: 0}),
      ],
    };
    const violations = validatePlan(plan, CATALOGUE, OPTIONS);

    expect(violations).toHaveLength(1);
    expect(violations[0]!.consignmentId).toBe('C1');
  });

  it('is happy with an empty plan', () => {
    expect(
      validatePlan({consignments: [], placements: []}, CATALOGUE, OPTIONS),
    ).toEqual([]);
  });
});

describe('support', () => {
  it('accepts a tier resting on a full tier below', () => {
    const plan = planWith([
      place({id: 'a0', tier: 0, x: 100, y: 0}),
      place({id: 'a1', tier: 0, x: 6200, y: 0}),
      place({id: 'b0', tier: 1, x: 100, y: 0}),
      place({id: 'b1', tier: 1, x: 6200, y: 0}),
    ]);

    expect(rules(plan)).toEqual([]);
  });

  it('bridges the gap between piles laid end to end', () => {
    // Tier 0 stops at 6100 and restarts at 6200; the bearers span that.
    const plan = planWith([
      place({id: 'a0', tier: 0, x: 100}),
      place({id: 'a1', tier: 0, x: 6200}),
      place({id: 'b0', tier: 1, x: 3000}),
    ]);

    expect(rules(plan)).toEqual([]);
  });

  it('flags a pile hanging over the end of the tier below', () => {
    const plan = planWith([
      place({id: 'a', tier: 0, x: 100}),
      place({id: 'b', tier: 1, x: 6200}),
    ]);

    expect(rules(plan)).toEqual(['unsupported']);
  });

  it('says how many piles are floating and in which tier', () => {
    const plan = planWith([
      place({id: 'a', tier: 0, x: 100}),
      place({id: 'b', tier: 1, x: 6200, y: 0}),
      place({id: 'c', tier: 1, x: 6200, y: 600}),
    ]);
    const violation = validatePlan(plan, CATALOGUE, OPTIONS)[0];

    expect(violation!.message).toBe(
      '2 piles in tier 2 overhang the tier below with nothing under them',
    );
  });

  it('never questions the bottom tier', () => {
    expect(rules(planWith([place({tier: 0, x: 5000})]))).toEqual([]);
  });

  it('flags a tier with nothing at all beneath it', () => {
    expect(rules(planWith([place({tier: 2})]))).toEqual(['unsupported']);
  });
});

describe('the arranger never builds an unsupported load', () => {
  it('closes a truck rather than stacking on a part-filled tier', () => {
    // 25 SP168 fills two tiers and leaves a third part filled.
    const job: Job = {
      name: 'j',
      lines: [
        {pileTypeId: 'SP168-D6', quantity: 25},
        {pileTypeId: 'SP139-S4', quantity: 14},
      ],
    };
    const withSecondType: Catalogue = {
      ...CATALOGUE,
      pileTypes: [
        SP168,
        {
          id: 'SP139-S4',
          name: 'SP139',
          length: 4500,
          shaftRadius: 70,
          mass: 96,
          helices: [{offsetFromButt: 350, radius: 175, thickness: 90}],
        },
      ],
    };
    const {plan} = arrangeNaively(job, withSecondType, SEMI, OPTIONS);

    expect(validatePlan(plan, withSecondType, OPTIONS)).toEqual([]);
  });
});
