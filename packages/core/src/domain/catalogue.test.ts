import {describe, expect, it} from '@jest/globals';
import {NZ_VDAM_2016} from '../rules/nzVdam';
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
  deckHeight: 1200,
  tare: 10600,
  maxGross: 30000,
  balanceTarget: null,
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
    tare: 6800,
    maxGross: 22000,
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
    it('sums the deck payloads when the route cap is not binding', () => {
      // Payloads total 17,000 kg; the cap leaves 36,000, so the decks bind.
      const lightTruck = {...TRUCK, tare: 5000, maxGross: 15000};
      const lightTrailer = {...TRAILER, tare: 3000, maxGross: 10000};
      expect(
        movementPayloadCapacity(
          {truck: lightTruck, trailer: lightTrailer},
          NZ_VDAM_2016,
        ),
      ).toBe(10000 + 7000);
    });

    it('caps a heavy combination at what the route allows it to gross', () => {
      // Deck payloads total 34,600 kg, but 44,000 minus both tares (17,400)
      // leaves only 26,600 kg of legal load.
      expect(
        movementPayloadCapacity({truck: TRUCK, trailer: TRAILER}, NZ_VDAM_2016),
      ).toBe(26600);
    });

    it('is the plain payload for a truck running solo under the cap', () => {
      expect(
        movementPayloadCapacity({truck: TRUCK, trailer: null}, NZ_VDAM_2016),
      ).toBe(19400);
    });
  });
});
