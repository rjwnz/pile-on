import {describe, expect, it} from '@jest/globals';
import {
  consignmentMass,
  consignmentPayload,
  loadOverhang,
  loadWidth,
  validatePlan,
} from './plan';
import {DEFAULT_LOADING_OPTIONS, type LoadingOptions} from '../domain/loading';
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
    {offsetFromButt: 400, radius: 225, length: 110},
    {offsetFromButt: 1100, radius: 175, length: 110},
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
  maxFrontOverhang: 0,
  maxRearOverhang: 0,
  balanceTarget: null,
  towableBy: [],
};

const CATALOGUE: Catalogue = {pileTypes: [SP168], vehicles: [SEMI]};

/**
 * Balance is stood down for the rule-by-rule tests below.
 *
 * Nearly all of them place one or two piles to exercise one specific rule, and
 * a two-pile load on a 12.5 m deck is unbalanced by construction — leaving the
 * real tolerance on would add an `unbalanced` to every expectation and tell us
 * nothing about the rule under test. The `balance` block uses the real defaults.
 */
const OPTIONS: LoadingOptions = {
  ...DEFAULT_LOADING_OPTIONS,
  balance: {longitudinal: 12500, lateral: 2450},
};
const STRICT = DEFAULT_LOADING_OPTIONS;

function place(overrides: Partial<Placement> = {}): Placement {
  return {
    id: 'PL-1',
    consignmentId: 'C1',
    deck: 'truck',
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
    consignments: [
      {id: 'C1', vehicleId: 'SEMI-45', trailerId: null, phase: null},
    ],
    placements,
  };
}

function rules(plan: LoadPlan, catalogue = CATALOGUE): string[] {
  return validatePlan(plan, catalogue, OPTIONS).map(v => v.rule);
}

describe('the arranger and the validator agree', () => {
  it('accepts everything the naive arranger produces, balance included', () => {
    const job: Job = {
      name: 'j',
      lines: [{pileTypeId: 'SP168-D6', quantity: 95}],
    };
    const {plan} = arrangeNaively(job, CATALOGUE, STRICT);

    expect(plan.consignments.length).toBeGreaterThan(1);
    expect(validatePlan(plan, CATALOGUE, STRICT)).toEqual([]);
  });

  it('accepts a part-loaded last truck, which is where balance goes wrong', () => {
    // 95 leaves the third truck 15 of a possible 40 — a full tier and a tier
    // with five on it. That is the load the arranger has to keep on its feet.
    const job: Job = {
      name: 'j',
      lines: [{pileTypeId: 'SP168-D6', quantity: 95}],
    };
    const {plan} = arrangeNaively(job, CATALOGUE, STRICT);
    const last = plan.consignments[plan.consignments.length - 1]!;
    const onLast = plan.placements.filter(p => p.consignmentId === last.id);

    expect(onLast).toHaveLength(15);
    expect(
      validatePlan(plan, CATALOGUE, STRICT).filter(
        v => v.consignmentId === last.id,
      ),
    ).toEqual([]);
  });

  it('accepts a lane pitch that is exactly the required separation', () => {
    // The arranger packs lanes at precisely helix-OD + clearance. Floating
    // point must not turn "exactly enough" into a clash.
    const plan = planWith([
      place({id: 'a', y: 0}),
      place({id: 'b', y: 225 + 225 + OPTIONS.clearances.helixToHelix}),
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

    // 200 × 178 = 35,600 of pile, plus 60 kg of bearers on each of the 200
    // tiers, against a 28,200 kg payload.
    expect(violation!.message).toMatch(/47,600 kg/);
    expect(violation!.message).toMatch(/28,200 kg payload/);
    expect(violation!.message).toMatch(/by 19,400 kg/);
  });

  it('totals only the piles it can resolve', () => {
    expect(
      consignmentMass(
        [place({id: 'a'}), place({id: 'b', pileTypeId: 'GHOST'})],
        CATALOGUE,
      ),
    ).toBe(178);
  });

  it('charges bearers and lashings once per tier, not once per pile', () => {
    const twoTiers = [
      place({id: 'a', tier: 0}),
      place({id: 'b', tier: 0, y: 600}),
      place({id: 'c', tier: 1}),
    ];

    expect(consignmentPayload(twoTiers, CATALOGUE, OPTIONS)).toBe(
      178 * 3 + 60 * 2,
    );
  });

  it('counts a load that only fits with the bearers ignored as over', () => {
    // 158 piles is 28,124 kg, inside the 28,200 kg payload — until the four
    // tiers of bearers under them are counted too.
    const heavy = Array.from({length: 158}, (_, i) =>
      place({id: `p${i}`, tier: i % 4, y: i * 10}),
    );
    const found = validatePlan(planWith(heavy), CATALOGUE, OPTIONS);

    expect(consignmentMass(heavy, CATALOGUE)).toBeLessThan(28200);
    expect(found.map(v => v.rule)).toContain('over-payload');
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

describe('the envelope', () => {
  /** The same semi, but with the yard willing to let a load hang out the back. */
  const TOLERANT: Vehicle = {...SEMI, id: 'SEMI-OH', maxRearOverhang: 2000};
  const TOLERANT_CATALOGUE: Catalogue = {
    pileTypes: [SP168],
    vehicles: [TOLERANT],
  };

  function onTolerant(placements: Placement[]): LoadPlan {
    return {
      consignments: [
        {id: 'C1', vehicleId: 'SEMI-OH', trailerId: null, phase: null},
      ],
      placements,
    };
  }

  it('rejects an overhang on a vehicle set to carry none', () => {
    const violation = validatePlan(
      planWith([place({x: 7000})]),
      CATALOGUE,
      OPTIONS,
    )[0];

    expect(violation!.rule).toBe('over-rear-overhang');
    expect(violation!.severity).toBe('error');
    expect(violation!.message).toContain('500 mm');
  });

  it('rejects an overhang past what the vehicle allows, and says the allowance', () => {
    const violation = validatePlan(
      onTolerant([place({x: 9000})]),
      TOLERANT_CATALOGUE,
      OPTIONS,
    )[0];

    expect(violation!.rule).toBe('over-rear-overhang');
    expect(violation!.message).toContain('2500 mm');
    expect(violation!.message).toContain('2000 mm allowed');
  });

  it('only notes an overhang the vehicle is allowed', () => {
    const violation = validatePlan(
      onTolerant([place({x: 7000})]),
      TOLERANT_CATALOGUE,
      OPTIONS,
    )[0];

    expect(violation!.rule).toBe('rear-overhang');
    expect(violation!.severity).toBe('warning');
  });

  it('mentions flags and lamps once an allowed overhang passes a metre', () => {
    expect(
      validatePlan(
        onTolerant([place({x: 7600})]),
        TOLERANT_CATALOGUE,
        OPTIONS,
      )[0]!.message,
    ).toContain('flags by day and lamps at night');
  });

  it('reports an overhang as either an error or a note, never both', () => {
    const found = validatePlan(
      planWith([place({x: 7000})]),
      CATALOGUE,
      OPTIONS,
    );

    expect(found.filter(v => v.rule.includes('overhang'))).toHaveLength(1);
  });

  it('flags a pile placed ahead of the headboard', () => {
    expect(rules(planWith([place({x: -50})]))).toContain('ahead-of-headboard');
  });

  it('flags a pile that eats into the side margin', () => {
    // 2450 deck less two 50 mm margins leaves 1175 mm each side of the
    // centreline; a 225 mm plate at y = 1000 reaches 1225.
    const violation = validatePlan(
      planWith([place({y: 1000})]),
      CATALOGUE,
      OPTIONS,
    ).find(v => v.rule === 'outside-side-margin');

    expect(violation!.message).toContain('1225 mm');
    expect(violation!.message).toContain('1175 mm');
  });

  it('is happy with a pile just inside the side margin', () => {
    expect(rules(planWith([place({y: 950})]))).toEqual([]);
  });
});

describe('loadOverhang', () => {
  it('is zero for a load sitting wholly on the deck', () => {
    expect(loadOverhang([place({x: 100})], CATALOGUE, SEMI)).toEqual({
      front: 0,
      rear: 0,
    });
  });

  it('measures how far the furthest pile hangs off the back', () => {
    expect(
      loadOverhang(
        [place({id: 'a', x: 100}), place({id: 'b', x: 7000})],
        CATALOGUE,
        SEMI,
      ),
    ).toEqual({front: 0, rear: 500});
  });

  it('measures a load pushed out past the headboard', () => {
    expect(loadOverhang([place({x: -250})], CATALOGUE, SEMI).front).toBe(250);
  });

  it('ignores piles whose type is not in the catalogue', () => {
    expect(
      loadOverhang(
        [
          place({id: 'a', x: 100}),
          place({id: 'b', pileTypeId: 'GHOST', x: 90000}),
        ],
        CATALOGUE,
        SEMI,
      ),
    ).toEqual({front: 0, rear: 0});
  });

  it('agrees with the rule that rejects it', () => {
    // The metric and the violation have to be reading the same geometry, or a
    // truck can show a comfortable number beside a red badge.
    const plan = planWith([place({x: 7000})]);
    const violation = validatePlan(plan, CATALOGUE, OPTIONS).find(
      v => v.rule === 'over-rear-overhang',
    );

    expect(violation!.message).toContain(
      String(loadOverhang(plan.placements, CATALOGUE, SEMI).rear),
    );
  });
});

describe('balance', () => {
  function balanceRules(placements: Placement[], vehicle = SEMI): string[] {
    return validatePlan(
      {
        consignments: [
          {id: 'C1', vehicleId: vehicle.id, trailerId: null, phase: null},
        ],
        placements,
      },
      {pileTypes: [SP168], vehicles: [vehicle]},
      STRICT,
    ).map(v => v.rule);
  }

  it('flags a load bunched against the headboard', () => {
    // One pile spanning 100–6100 has its centre of mass at 3100, and the deck
    // wants it at 6250.
    expect(balanceRules([place({x: 100})])).toContain('unbalanced');
  });

  it('says which way and by how much', () => {
    const violation = validatePlan(
      planWith([place({x: 100})]),
      CATALOGUE,
      STRICT,
    ).find(v => v.rule === 'unbalanced');

    expect(violation!.message).toContain('3150 mm ahead of');
    expect(violation!.message).toContain('6250 mm balance point');
  });

  it('accepts a load sitting on the balance point', () => {
    expect(balanceRules([place({x: 3250})])).toEqual([]);
  });

  it('respects a balance target the yard has actually stated', () => {
    const forward: Vehicle = {...SEMI, balanceTarget: 5000};

    expect(balanceRules([place({x: 2000})], forward)).toEqual([]);
    expect(balanceRules([place({x: 3250})], forward)).toContain('unbalanced');
  });

  it('flags a load down one side of the deck', () => {
    const violation = validatePlan(
      planWith([
        place({id: 'a', x: 3250, y: 900}),
        place({id: 'b', x: 3250, y: 400}),
      ]),
      CATALOGUE,
      STRICT,
    ).find(v => v.rule === 'unbalanced');

    expect(violation!.message).toContain('650 mm to the right');
  });

  it('has nothing to say about an empty truck', () => {
    expect(balanceRules([])).toEqual([]);
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
      consignments: [
        {id: 'C1', vehicleId: 'SEMI-45', trailerId: null, phase: null},
      ],
      placements: [place({consignmentId: 'C9'})],
    };

    expect(rules(plan)).toContain('unknown-consignment');
  });
});

describe('multiple consignments', () => {
  it('checks each truck on its own placements', () => {
    const plan: LoadPlan = {
      consignments: [
        {id: 'C1', vehicleId: 'SEMI-45', trailerId: null, phase: null},
        {id: 'C2', vehicleId: 'SEMI-45', trailerId: null, phase: null},
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
          helices: [{offsetFromButt: 350, radius: 175, length: 90}],
        },
      ],
    };
    const {plan} = arrangeNaively(job, withSecondType, OPTIONS);

    expect(validatePlan(plan, withSecondType, OPTIONS)).toEqual([]);
  });
});

describe('movements with a trailer', () => {
  const RIGID: Vehicle = {
    ...SEMI,
    id: 'RIGID-8',
    kind: 'rigid',
    deckLength: 7200,
    deckHeight: 1200,
    tare: 10600,
    maxGross: 30000,
  };
  const TRAILER: Vehicle = {
    ...SEMI,
    id: 'TRAILER-4A',
    kind: 'full_trailer',
    deckLength: 8100,
    deckHeight: 1150,
    tare: 6800,
    maxGross: 22000,
    towableBy: ['RIGID-8'],
  };
  const FLEET: Catalogue = {
    pileTypes: [SP168],
    vehicles: [RIGID, TRAILER],
  };

  function movement(
    trailerId: string | null,
    placements: Placement[],
    catalogue = FLEET,
  ) {
    return validatePlan(
      {
        consignments: [
          {id: 'C1', vehicleId: 'RIGID-8', trailerId, phase: null},
        ],
        placements,
      },
      catalogue,
      OPTIONS,
    );
  }

  it('rejects a movement led by a trailer', () => {
    const led = validatePlan(
      {
        consignments: [
          {id: 'C1', vehicleId: 'TRAILER-4A', trailerId: null, phase: null},
        ],
        placements: [],
      },
      FLEET,
      OPTIONS,
    );

    expect(led.map(v => v.rule)).toEqual(['vehicle-is-trailer']);
  });

  it('rejects a trailer that is not in the catalogue', () => {
    expect(movement('GONE', []).map(v => v.rule)).toEqual(['unknown-trailer']);
  });

  it('rejects a pairing the trailer does not list', () => {
    const wrongTruck = validatePlan(
      {
        consignments: [
          {
            id: 'C1',
            vehicleId: 'SEMI-45',
            trailerId: 'TRAILER-4A',
            phase: null,
          },
        ],
        placements: [],
      },
      {pileTypes: [SP168], vehicles: [SEMI, RIGID, TRAILER]},
      OPTIONS,
    );

    expect(wrongTruck.map(v => v.rule)).toEqual(['not-towable']);
  });

  it('rejects placements on a trailer deck the movement does not have', () => {
    const rules = movement(null, [
      place({deck: 'trailer', consignmentId: 'C1'}),
    ]).map(v => v.rule);

    expect(rules).toContain('phantom-deck');
    // The orphaned placement is not judged against the truck deck.
    expect(rules).not.toContain('ahead-of-headboard');
  });

  it('judges each deck against its own row, not the movement pooled', () => {
    // Two piles per deck, each pair legal on its own deck. Pooled, the piles
    // at equal x would clash and the mass would be charged twice.
    const rules = movement('TRAILER-4A', [
      place({id: 'T1', consignmentId: 'C1', deck: 'truck', x: 100, y: -400}),
      place({id: 'T2', consignmentId: 'C1', deck: 'trailer', x: 100, y: -400}),
    ]).map(v => v.rule);

    expect(rules).toEqual([]);
  });

  it('prefixes deck messages only when there is a trailer to confuse', () => {
    const withTrailer = movement('TRAILER-4A', [
      place({consignmentId: 'C1', deck: 'truck', x: -600}),
    ]);
    const solo = movement(null, [place({consignmentId: 'C1', x: -600})]);

    expect(withTrailer.map(v => v.message)).toEqual([
      expect.stringMatching(/^truck deck: /),
    ]);
    expect(solo[0]!.message).not.toMatch(/deck:/);
  });

  // One pile carrying a deck's worth of mass, so the mass rules can be
  // exercised without inventing a geometrically legal 60-pile layout.
  const SLAB: PileType = {
    id: 'SLAB',
    name: 'SLAB',
    length: 6000,
    shaftRadius: 84,
    mass: 15000,
    helices: [],
  };
  const HEAVY_FLEET: Catalogue = {
    pileTypes: [SP168, SLAB],
    vehicles: [RIGID, TRAILER],
  };

  it('caps what the combination may gross at the route limit', () => {
    // 15 t per deck is inside each deck's own payload (19.4 t and 15.2 t),
    // but with 17.4 t of tares the combination grosses past 44 t.
    const rules = movement(
      'TRAILER-4A',
      [
        place({
          id: 'K1',
          consignmentId: 'C1',
          deck: 'truck',
          pileTypeId: 'SLAB',
        }),
        place({
          id: 'R1',
          consignmentId: 'C1',
          deck: 'trailer',
          pileTypeId: 'SLAB',
        }),
      ],
      HEAVY_FLEET,
    ).map(v => v.rule);

    expect(rules).toContain('over-combined-gross');
    // Neither deck is over its own payload — the cap is the only mass problem.
    expect(rules).not.toContain('over-payload');
  });

  it('warns when the trailer grosses more than 1.5 times the truck', () => {
    // A bare truck (10.6 t) towing 6.8 t of trailer plus 15 t of pile: the
    // trailer grosses about twice the truck.
    const found = movement(
      'TRAILER-4A',
      [
        place({
          id: 'R1',
          consignmentId: 'C1',
          deck: 'trailer',
          pileTypeId: 'SLAB',
        }),
      ],
      HEAVY_FLEET,
    );

    expect(found.map(v => v.rule)).toContain('trailer-heavy');
    expect(found.find(v => v.rule === 'trailer-heavy')!.severity).toBe(
      'warning',
    );
  });
});
