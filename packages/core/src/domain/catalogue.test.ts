import {describe, expect, it} from '@jest/globals';
import {
  EMPTY_CATALOGUE,
  EMPTY_PLAN,
  combinationDeckArea,
  combinationsOf,
  findPileType,
  findVehicle,
  movementPayloadCapacity,
  removeById,
  trailersFor,
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
  payloadCapacity: 19400,
  towableBy: [],
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

describe('composing the fleet into combinations', () => {
  const TRUCK: Vehicle = {...VEHICLE, id: 'RIGID-8'};
  const OTHER: Vehicle = {...VEHICLE, id: 'RIGID-6', deckLength: 6100};
  const TRAILER: Vehicle = {
    ...VEHICLE,
    id: 'TRAILER-4A',
    kind: 'full_trailer',
    deckLength: 8100,
    payloadCapacity: 15200,
    towableBy: ['RIGID-8'],
  };
  const FLEET: Catalogue = {
    pileTypes: [],
    vehicles: [TRUCK, OTHER, TRAILER],
  };

  it('lists the trailers a truck may tow', () => {
    expect(trailersFor(FLEET, 'RIGID-8').map(v => v.id)).toEqual([
      'TRAILER-4A',
    ]);
    expect(trailersFor(FLEET, 'RIGID-6')).toEqual([]);
  });

  it('fields each truck alone, then with each trailer that names it', () => {
    expect(
      combinationsOf(FLEET).map(
        combo => `${combo.truck.id}+${combo.trailer?.id ?? 'solo'}`,
      ),
    ).toEqual(['RIGID-8+solo', 'RIGID-8+TRAILER-4A', 'RIGID-6+solo']);
  });

  it('never fields a trailer on its own, so an all-trailer catalogue is empty', () => {
    expect(combinationsOf({pileTypes: [], vehicles: [TRAILER]})).toEqual([]);
  });

  it('sums the deck area a combination commits', () => {
    expect(combinationDeckArea({truck: TRUCK, trailer: null})).toBe(
      7200 * 2450,
    );
    expect(combinationDeckArea({truck: TRUCK, trailer: TRAILER})).toBe(
      7200 * 2450 + 8100 * 2450,
    );
  });

  describe('movementPayloadCapacity', () => {
    it('sums the two decks own load capacities', () => {
      // 19,400 on the truck plus 15,200 on the trailer, nothing else to cap it.
      expect(movementPayloadCapacity({truck: TRUCK, trailer: TRAILER})).toBe(
        19400 + 15200,
      );
    });

    it('is the plain load capacity for a truck running solo', () => {
      expect(movementPayloadCapacity({truck: TRUCK, trailer: null})).toBe(
        19400,
      );
    });
  });
});
