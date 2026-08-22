import {describe, expect, it} from '@jest/globals';
import type {Vehicle} from '../domain/vehicle';
import type {PileType} from '../domain/pile';
import {
  STATE_FORMAT_VERSION,
  applyImport,
  emptyAppState,
  findDanglingReferences,
  parseAppState,
  serialiseAppState,
  type AppState,
} from './appState';

const NOW = '2026-08-22T10:00:00.000Z';

const PILE_TYPE: PileType = {
  id: 'SP168-D6',
  name: 'SP168',
  length: 6000,
  shaftRadius: 84,
  mass: 178,
  helices: [{offsetFromButt: 400, radius: 225, length: 110}],
};

const VEHICLE: Vehicle = {
  id: 'SEMI-45',
  name: 'Semi',
  kind: 'semi_trailer',
  deckLength: 12500,
  deckWidth: 2450,
  deckHeight: 1350,
  tare: 15800,
  maxGross: 44000,
};

const POPULATED: AppState = {
  ...emptyAppState(NOW),
  catalogue: {pileTypes: [PILE_TYPE], vehicles: [VEHICLE]},
  job: {
    name: 'Te Rapa warehouse',
    lines: [{pileTypeId: 'SP168-D6', quantity: 12}],
  },
  plan: {
    consignments: [{id: 'C1', vehicleId: 'SEMI-45', phase: null}],
    placements: [
      {
        id: 'PL-1',
        consignmentId: 'C1',
        pileTypeId: 'SP168-D6',
        tier: 0,
        x: 100,
        y: 0,
        flipped: false,
      },
    ],
  },
};

function messages(result: ReturnType<typeof parseAppState>): string[] {
  return result.ok ? [] : result.issues.map(i => `${i.path}: ${i.message}`);
}

describe('serialise / parse round trip', () => {
  it('survives a full round trip unchanged', () => {
    const result = parseAppState(serialiseAppState(POPULATED));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual(POPULATED);
  });

  it('round-trips an empty state', () => {
    const empty = emptyAppState(NOW);
    const result = parseAppState(serialiseAppState(empty));

    expect(result.ok && result.value).toEqual(empty);
  });

  it('records the ruleset that produced it', () => {
    expect(emptyAppState(NOW).rulesetVersion).toBe('nz-vdam-2016');
  });
});

describe('parseAppState', () => {
  it('rejects text that is not JSON', () => {
    expect(messages(parseAppState('not json'))[0]).toMatch(
      /^file: is not valid JSON/,
    );
  });

  it('rejects JSON that is not an object', () => {
    expect(messages(parseAppState('[1,2,3]'))).toEqual([
      'file: must contain a JSON object',
    ]);
  });

  it('warns when the file has no format version', () => {
    expect(messages(parseAppState('{}'))).toContain(
      'formatVersion: is missing — this may not be a Pile-On file',
    );
  });

  it('refuses a file written by a newer build rather than mangling it', () => {
    const future = JSON.stringify({...POPULATED, formatVersion: 99});

    expect(messages(parseAppState(future))).toContain(
      `formatVersion: is 99, but this build only reads up to ${STATE_FORMAT_VERSION}. Update Pile-On.`,
    );
  });

  it('reports a pile type with a missing id', () => {
    const raw = JSON.stringify({
      formatVersion: STATE_FORMAT_VERSION,
      catalogue: {pileTypes: [{name: 'no id'}], vehicles: []},
    });

    expect(messages(parseAppState(raw))).toEqual([
      'catalogue / pileTypes[0] / id: must be a non-empty string',
    ]);
  });

  it('reports a pile type with non-numeric dimensions', () => {
    const raw = JSON.stringify({
      formatVersion: STATE_FORMAT_VERSION,
      catalogue: {pileTypes: [{id: 'X', length: '6 m'}], vehicles: []},
    });

    expect(messages(parseAppState(raw))).toEqual([
      'catalogue / pileTypes[0]: length, shaftRadius and mass must be numbers',
    ]);
  });

  it('reports a vehicle with non-numeric masses', () => {
    const raw = JSON.stringify({
      formatVersion: STATE_FORMAT_VERSION,
      catalogue: {pileTypes: [], vehicles: [{id: 'V', tare: 'heavy'}]},
    });

    expect(messages(parseAppState(raw))).toEqual([
      'catalogue / vehicles[0]: deck dimensions, tare and maxGross must be numbers',
    ]);
  });

  it('rejects a catalogue collection that is not an array', () => {
    const raw = JSON.stringify({
      formatVersion: STATE_FORMAT_VERSION,
      catalogue: {pileTypes: 'lots', vehicles: []},
    });

    expect(messages(parseAppState(raw))).toEqual([
      'catalogue / pileTypes: must be an array',
    ]);
  });

  it('defaults a missing catalogue to empty rather than failing', () => {
    const raw = JSON.stringify({formatVersion: STATE_FORMAT_VERSION});
    const result = parseAppState(raw);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.catalogue).toEqual({
      pileTypes: [],
      vehicles: [],
    });
  });
});

describe('applyImport', () => {
  const incoming: AppState = {
    ...emptyAppState('2026-01-01T00:00:00.000Z'),
    catalogue: {pileTypes: [{...PILE_TYPE, id: 'OTHER'}], vehicles: []},
    job: {name: 'Other job', lines: [{pileTypeId: 'OTHER', quantity: 5}]},
    plan: {consignments: [], placements: []},
  };

  it('takes catalogue and plan when asked for both', () => {
    const next = applyImport(POPULATED, incoming, 'catalogue-and-plan', NOW);

    expect(next.catalogue).toEqual(incoming.catalogue);
    expect(next.plan).toEqual(incoming.plan);
  });

  it('takes only the catalogue and keeps the current plan', () => {
    const next = applyImport(POPULATED, incoming, 'catalogue-only', NOW);

    expect(next.catalogue).toEqual(incoming.catalogue);
    expect(next.plan).toEqual(POPULATED.plan);
  });

  it('stamps the save time on either path', () => {
    expect(
      applyImport(POPULATED, incoming, 'catalogue-only', NOW).savedAt,
    ).toBe(NOW);
    expect(
      applyImport(POPULATED, incoming, 'catalogue-and-plan', NOW).savedAt,
    ).toBe(NOW);
  });
});

describe('findDanglingReferences', () => {
  it('finds nothing wrong with a consistent state', () => {
    expect(findDanglingReferences(POPULATED)).toEqual([]);
  });

  it('catches a plan orphaned by a catalogue-only import', () => {
    const orphaned = applyImport(
      POPULATED,
      {
        ...emptyAppState(NOW),
        catalogue: {pileTypes: [], vehicles: []},
      },
      'catalogue-only',
      NOW,
    );

    expect(findDanglingReferences(orphaned).map(i => i.message)).toEqual([
      'needs 12 of missing pile type "SP168-D6"',
      'uses missing vehicle "SEMI-45"',
      'places missing pile type "SP168-D6"',
    ]);
  });

  it('catches a placement of a pile type that is not in the catalogue', () => {
    const broken: AppState = {
      ...POPULATED,
      plan: {
        ...POPULATED.plan,
        placements: [
          {
            id: 'PL-9',
            consignmentId: 'C1',
            pileTypeId: 'GHOST',
            tier: 0,
            x: 0,
            y: 0,
            flipped: false,
          },
        ],
      },
    };

    expect(findDanglingReferences(broken).map(i => i.message)).toEqual([
      'places missing pile type "GHOST"',
    ]);
  });
});

describe('parseAppState — malformed entries', () => {
  function raw(catalogue: unknown): string {
    return JSON.stringify({formatVersion: STATE_FORMAT_VERSION, catalogue});
  }

  it('rejects a pile type that is not an object at all', () => {
    expect(
      messages(parseAppState(raw({pileTypes: ['nope'], vehicles: []}))),
    ).toEqual(['catalogue / pileTypes[0]: must be an object']);
  });

  it('rejects a vehicle that is not an object at all', () => {
    expect(
      messages(parseAppState(raw({pileTypes: [], vehicles: [7]}))),
    ).toEqual(['catalogue / vehicles[0]: must be an object']);
  });

  it('rejects a vehicle with a missing id', () => {
    expect(
      messages(
        parseAppState(raw({pileTypes: [], vehicles: [{name: 'no id'}]})),
      ),
    ).toEqual(['catalogue / vehicles[0] / id: must be a non-empty string']);
  });

  it('rejects a malformed helix', () => {
    const source = raw({
      pileTypes: [
        {
          id: 'X',
          length: 6000,
          shaftRadius: 84,
          mass: 178,
          helices: [{offsetFromButt: 400, radius: 'wide', length: 110}],
        },
      ],
      vehicles: [],
    });

    expect(messages(parseAppState(source))).toEqual([
      'catalogue / pileTypes[0] / helices: each helix needs numeric offsetFromButt, radius and length',
    ]);
  });

  it('defaults a missing name to the id and a missing kind to rigid', () => {
    const source = raw({
      pileTypes: [{id: 'X', length: 6000, shaftRadius: 84, mass: 178}],
      vehicles: [
        {
          id: 'V',
          deckLength: 7200,
          deckWidth: 2450,
          deckHeight: 1200,
          tare: 10600,
          maxGross: 30000,
        },
      ],
    });
    const result = parseAppState(source);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.catalogue.pileTypes[0]!.name).toBe('X');
    expect(result.ok && result.value.catalogue.vehicles[0]!.kind).toBe('rigid');
  });
});

describe('reading a version 1 file', () => {
  /*
   * Version 1 carried `vehicle.axles`. Version 2 dropped it. Old saved
   * sessions must still open — this is the whole point of stamping a format
   * version, so it gets a test rather than an assumption.
   */
  const V1 = JSON.stringify({
    formatVersion: 1,
    savedAt: '2026-08-01T00:00:00.000Z',
    rulesetVersion: 'nz-vdam-2016',
    catalogue: {
      pileTypes: [],
      vehicles: [
        {
          id: 'SEMI-45',
          name: 'Semi',
          kind: 'semi_trailer',
          deckLength: 12500,
          deckWidth: 2450,
          deckHeight: 1350,
          tare: 15800,
          maxGross: 44000,
          axles: [
            {xFromFront: 0, tyreClass: 'SL', setId: 'steer', steering: true},
            {xFromFront: 3550, tyreClass: 'T', setId: 'drive', steering: false},
          ],
        },
      ],
    },
    plan: {piles: [], consignments: [], placements: []},
  });

  it('opens without complaint', () => {
    expect(parseAppState(V1).ok).toBe(true);
  });

  it('keeps the deck and mass figures', () => {
    const result = parseAppState(V1);

    expect(result.ok && result.value.catalogue.vehicles[0]).toEqual({
      id: 'SEMI-45',
      name: 'Semi',
      kind: 'semi_trailer',
      deckLength: 12500,
      deckWidth: 2450,
      deckHeight: 1350,
      tare: 15800,
      maxGross: 44000,
    });
  });

  it('drops the axle data rather than carrying it as dead weight', () => {
    const result = parseAppState(V1);

    expect(
      result.ok && Object.keys(result.value.catalogue.vehicles[0]!),
    ).not.toContain('axles');
  });

  it('is re-saved at the current format version', () => {
    const result = parseAppState(V1);

    expect(result.ok && result.value.formatVersion).toBe(STATE_FORMAT_VERSION);
  });
});

describe('parseAppState — job and plan entries', () => {
  function withParts(parts: Record<string, unknown>): string {
    return JSON.stringify({formatVersion: STATE_FORMAT_VERSION, ...parts});
  }

  it('rejects a job line that is not an object', () => {
    expect(
      messages(parseAppState(withParts({job: {lines: ['SP168-D6']}}))),
    ).toEqual(['job / lines[0]: must be an object']);
  });

  it('rejects a job line with no pile type', () => {
    expect(
      messages(parseAppState(withParts({job: {lines: [{quantity: 10}]}}))),
    ).toEqual(['job / lines[0] / pileTypeId: must be a non-empty string']);
  });

  it('rejects a fractional or negative job quantity', () => {
    const fractional = withParts({
      job: {lines: [{pileTypeId: 'A', quantity: 2.5}]},
    });
    const negative = withParts({
      job: {lines: [{pileTypeId: 'A', quantity: -1}]},
    });
    const expected = [
      'job / lines[0] / quantity: must be a whole number of piles, zero or more',
    ];

    expect(messages(parseAppState(fractional))).toEqual(expected);
    expect(messages(parseAppState(negative))).toEqual(expected);
  });

  it('defaults a missing job to an unnamed empty schedule', () => {
    const result = parseAppState(withParts({}));

    expect(result.ok && result.value.job).toEqual({name: '', lines: []});
  });

  it('rejects a consignment that is not an object or has no vehicle', () => {
    expect(
      messages(parseAppState(withParts({plan: {consignments: [7]}}))),
    ).toEqual(['plan / consignments[0]: must be an object']);
    expect(
      messages(parseAppState(withParts({plan: {consignments: [{id: 'C1'}]}}))),
    ).toEqual(['plan / consignments[0]: needs a non-empty id and vehicleId']);
  });

  it('defaults a consignment with no phase to unphased', () => {
    const result = parseAppState(
      withParts({plan: {consignments: [{id: 'C1', vehicleId: 'V'}]}}),
    );

    expect(result.ok && result.value.plan.consignments[0]!.phase).toBeNull();
  });

  it('drops a version 2 placement rather than guessing at its shape', () => {
    // Version 2 carried `pileId` and no `id`. Nothing produced placements back
    // then, so dropping with an issue is honest and costs nobody real data.
    const v2Placement = JSON.stringify({
      formatVersion: 2,
      plan: {placements: [{pileId: 'P-1', tier: 0, x: 100, y: 0}]},
    });

    expect(messages(parseAppState(v2Placement))).toEqual([
      'plan / placements[0]: needs a non-empty id, consignmentId and pileTypeId',
    ]);
  });

  it('rejects a placement that is not an object', () => {
    expect(
      messages(parseAppState(withParts({plan: {placements: ['nope']}}))),
    ).toEqual(['plan / placements[0]: must be an object']);
  });

  it('rejects a placement with non-numeric coordinates', () => {
    const source = withParts({
      plan: {
        placements: [
          {
            id: 'PL-1',
            consignmentId: 'C1',
            pileTypeId: 'A',
            tier: 0,
            x: 'left',
          },
        ],
      },
    });

    expect(messages(parseAppState(source))).toEqual([
      'plan / placements[0]: tier, x and y must be numbers',
    ]);
  });

  it('treats a missing flipped flag as not flipped', () => {
    const source = withParts({
      plan: {
        placements: [
          {
            id: 'PL-1',
            consignmentId: 'C1',
            pileTypeId: 'A',
            tier: 0,
            x: 0,
            y: 0,
          },
        ],
      },
    });
    const result = parseAppState(source);

    expect(result.ok && result.value.plan.placements[0]!.flipped).toBe(false);
  });
});

describe('reading a version 4 file', () => {
  it('accepts the old helix thickness field as its length', () => {
    const v4 = JSON.stringify({
      formatVersion: 4,
      catalogue: {
        pileTypes: [
          {
            id: 'X',
            length: 6000,
            shaftRadius: 84,
            mass: 178,
            helices: [{offsetFromButt: 400, radius: 225, thickness: 110}],
          },
        ],
        vehicles: [],
      },
    });
    const result = parseAppState(v4);

    expect(result.ok).toBe(true);
    expect(
      result.ok && result.value.catalogue.pileTypes[0]!.helices[0],
    ).toEqual({offsetFromButt: 400, radius: 225, length: 110});
  });
});
