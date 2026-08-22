import {describe, expect, it} from '@jest/globals';
import {
  EMPTY_CATALOGUE,
  EMPTY_PLAN,
  findPileType,
  findVehicle,
  removeById,
  upsertById,
  type Catalogue,
} from './catalogue';
import type {PileType} from './pile';
import type {Vehicle} from './vehicle';

const TYPE: PileType = {
  id: 'A',
  name: 'A',
  length: 6000,
  shaftRadius: 84,
  mass: 178,
  helices: [],
};

const VEHICLE: Vehicle = {
  id: 'V',
  name: 'V',
  kind: 'rigid',
  deckLength: 7200,
  deckWidth: 2450,
  deckHeight: 1200,
  tare: 10600,
  maxGross: 30000,
  maxFrontOverhang: 0,
  maxRearOverhang: 0,
  balanceTarget: null,
};

const CATALOGUE: Catalogue = {pileTypes: [TYPE], vehicles: [VEHICLE]};

describe('lookups', () => {
  it('finds a pile type by id', () => {
    expect(findPileType(CATALOGUE, 'A')).toBe(TYPE);
  });

  it('returns undefined for an unknown pile type', () => {
    expect(findPileType(CATALOGUE, 'nope')).toBeUndefined();
  });

  it('finds a vehicle by id', () => {
    expect(findVehicle(CATALOGUE, 'V')).toBe(VEHICLE);
  });

  it('returns undefined for an unknown vehicle', () => {
    expect(findVehicle(CATALOGUE, 'nope')).toBeUndefined();
  });
});

describe('upsertById', () => {
  it('appends something new', () => {
    expect(upsertById([TYPE], {...TYPE, id: 'B'}).map(t => t.id)).toEqual([
      'A',
      'B',
    ]);
  });

  it('replaces in place, keeping position', () => {
    const list = [TYPE, {...TYPE, id: 'B'}, {...TYPE, id: 'C'}];
    const updated = upsertById(list, {...TYPE, id: 'B', mass: 999});

    expect(updated.map(t => t.id)).toEqual(['A', 'B', 'C']);
    expect(updated[1]!.mass).toBe(999);
  });

  it('does not mutate the list it was given', () => {
    const list = [TYPE];
    upsertById(list, {...TYPE, id: 'B'});

    expect(list).toHaveLength(1);
  });
});

describe('removeById', () => {
  it('drops the matching entry', () => {
    expect(removeById([TYPE, {...TYPE, id: 'B'}], 'A').map(t => t.id)).toEqual([
      'B',
    ]);
  });

  it('is a no-op for an id that is not there', () => {
    expect(removeById([TYPE], 'nope')).toHaveLength(1);
  });
});

describe('empty values', () => {
  it('provides an empty catalogue and plan to start from', () => {
    expect(EMPTY_CATALOGUE).toEqual({pileTypes: [], vehicles: []});
    expect(EMPTY_PLAN).toEqual({consignments: [], placements: []});
  });
});
