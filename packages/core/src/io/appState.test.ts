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
  helices: [{offsetFromButt: 400, radius: 225, thickness: 110}],
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
  axles: [
    {xFromFront: 0, tyreClass: 'SL', setId: 'steer', steering: true},
    {xFromFront: 3550, tyreClass: 'T', setId: 'drive', steering: false},
  ],
};

const POPULATED: AppState = {
  ...emptyAppState(NOW),
  catalogue: {pileTypes: [PILE_TYPE], vehicles: [VEHICLE]},
  plan: {
    piles: [{id: 'P-1', typeId: 'SP168-D6'}],
    consignments: [{id: 'C1', vehicleId: 'SEMI-45', phase: null}],
    placements: [{pileId: 'P-1', tier: 0, x: 100, y: 0, flipped: false}],
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
      'formatVersion: is 99, but this build only reads up to 1. Update Pile-On.',
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
    plan: {
      piles: [{id: 'Q-1', typeId: 'OTHER'}],
      consignments: [],
      placements: [],
    },
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
      'uses missing pile type "SP168-D6"',
      'uses missing vehicle "SEMI-45"',
    ]);
  });

  it('catches a placement pointing at a pile that is not in the job', () => {
    const broken: AppState = {
      ...POPULATED,
      plan: {
        ...POPULATED.plan,
        placements: [{pileId: 'GHOST', tier: 0, x: 0, y: 0, flipped: false}],
      },
    };

    expect(findDanglingReferences(broken).map(i => i.message)).toEqual([
      'places unknown pile "GHOST"',
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
          helices: [{offsetFromButt: 400, radius: 'wide', thickness: 110}],
        },
      ],
      vehicles: [],
    });

    expect(messages(parseAppState(source))).toEqual([
      'catalogue / pileTypes[0] / helices: each helix needs numeric offsetFromButt, radius and thickness',
    ]);
  });

  it('rejects a malformed axle', () => {
    const source = raw({
      pileTypes: [],
      vehicles: [
        {
          id: 'V',
          deckLength: 7200,
          deckWidth: 2450,
          deckHeight: 1200,
          tare: 10600,
          maxGross: 30000,
          axles: [{xFromFront: 0, tyreClass: 'SL'}],
        },
      ],
    });

    expect(messages(parseAppState(source))).toEqual([
      'catalogue / vehicles[0] / axles: each axle needs xFromFront, tyreClass and setId',
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
    expect(result.ok && result.value.catalogue.vehicles[0]!.axles).toEqual([]);
  });

  it('keeps a steering flag through a round trip', () => {
    const source = raw({
      pileTypes: [],
      vehicles: [
        {
          id: 'V',
          deckLength: 7200,
          deckWidth: 2450,
          deckHeight: 1200,
          tare: 10600,
          maxGross: 30000,
          axles: [
            {xFromFront: 0, tyreClass: 'SL', setId: 'steer', steering: true},
          ],
        },
      ],
    });
    const result = parseAppState(source);

    expect(
      result.ok && result.value.catalogue.vehicles[0]!.axles[0]!.steering,
    ).toBe(true);
  });
});
