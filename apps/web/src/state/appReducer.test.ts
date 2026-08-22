import {describe, expect, it} from '@jest/globals';
import {
  emptyAppState,
  type AppState,
  type PileType,
  type Vehicle,
} from '@pile-on/core';
import {appReducer} from './appReducer';

const BASE: AppState = emptyAppState('2026-08-22T00:00:00.000Z');

function pileType(id: string, mass = 100): PileType {
  return {id, name: id, length: 6000, shaftRadius: 84, mass, helices: []};
}

function vehicle(id: string): Vehicle {
  return {
    id,
    name: id,
    kind: 'rigid',
    deckLength: 7200,
    deckWidth: 2450,
    deckHeight: 1200,
    tare: 10600,
    maxGross: 30000,
  };
}

describe('pile types', () => {
  it('adds a new type', () => {
    const next = appReducer(BASE, {
      type: 'upsertPileType',
      pileType: pileType('A'),
    });

    expect(next.catalogue.pileTypes).toHaveLength(1);
  });

  it('updates in place rather than duplicating a matching id', () => {
    const once = appReducer(BASE, {
      type: 'upsertPileType',
      pileType: pileType('A', 100),
    });
    const twice = appReducer(once, {
      type: 'upsertPileType',
      pileType: pileType('A', 250),
    });

    expect(twice.catalogue.pileTypes).toHaveLength(1);
    expect(twice.catalogue.pileTypes[0]!.mass).toBe(250);
  });

  it('removes by id', () => {
    const withOne = appReducer(BASE, {
      type: 'upsertPileType',
      pileType: pileType('A'),
    });
    const empty = appReducer(withOne, {type: 'removePileType', id: 'A'});

    expect(empty.catalogue.pileTypes).toEqual([]);
  });

  it('merges an import over the existing list', () => {
    const withOne = appReducer(BASE, {
      type: 'upsertPileType',
      pileType: pileType('A', 100),
    });
    const merged = appReducer(withOne, {
      type: 'importPileTypes',
      pileTypes: [pileType('A', 999), pileType('B')],
      replace: false,
    });

    expect(merged.catalogue.pileTypes.map(t => t.id)).toEqual(['A', 'B']);
    expect(merged.catalogue.pileTypes[0]!.mass).toBe(999);
  });

  it('replaces the whole list when asked to', () => {
    const withOne = appReducer(BASE, {
      type: 'upsertPileType',
      pileType: pileType('A'),
    });
    const replaced = appReducer(withOne, {
      type: 'importPileTypes',
      pileTypes: [pileType('B')],
      replace: true,
    });

    expect(replaced.catalogue.pileTypes.map(t => t.id)).toEqual(['B']);
  });

  it('leaves the vehicle list alone', () => {
    const withVehicle = appReducer(BASE, {
      type: 'upsertVehicle',
      vehicle: vehicle('V'),
    });
    const next = appReducer(withVehicle, {
      type: 'upsertPileType',
      pileType: pileType('A'),
    });

    expect(next.catalogue.vehicles).toHaveLength(1);
  });
});

describe('vehicles', () => {
  it('adds, updates and removes', () => {
    const added = appReducer(BASE, {
      type: 'upsertVehicle',
      vehicle: vehicle('V'),
    });
    expect(added.catalogue.vehicles).toHaveLength(1);

    const updated = appReducer(added, {
      type: 'upsertVehicle',
      vehicle: {...vehicle('V'), name: 'Renamed'},
    });
    expect(updated.catalogue.vehicles).toHaveLength(1);
    expect(updated.catalogue.vehicles[0]!.name).toBe('Renamed');

    expect(
      appReducer(updated, {type: 'removeVehicle', id: 'V'}).catalogue.vehicles,
    ).toEqual([]);
  });

  it('merges and replaces on import', () => {
    const withOne = appReducer(BASE, {
      type: 'upsertVehicle',
      vehicle: vehicle('V'),
    });

    expect(
      appReducer(withOne, {
        type: 'importVehicles',
        vehicles: [vehicle('W')],
        replace: false,
      }).catalogue.vehicles.map(v => v.id),
    ).toEqual(['V', 'W']);

    expect(
      appReducer(withOne, {
        type: 'importVehicles',
        vehicles: [vehicle('W')],
        replace: true,
      }).catalogue.vehicles.map(v => v.id),
    ).toEqual(['W']);
  });
});

describe('replaceState', () => {
  it('swaps the whole state', () => {
    const other: AppState = {
      ...BASE,
      catalogue: {pileTypes: [pileType('Z')], vehicles: []},
    };

    expect(appReducer(BASE, {type: 'replaceState', state: other})).toBe(other);
  });
});

describe('immutability', () => {
  it('never mutates the state it was given', () => {
    const before = JSON.stringify(BASE);
    appReducer(BASE, {type: 'upsertPileType', pileType: pileType('A')});

    expect(JSON.stringify(BASE)).toBe(before);
  });
});
