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
    balanceTarget: null,
    towableBy: [],
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

describe('job', () => {
  it('sets and keeps the job name', () => {
    const named = appReducer(BASE, {type: 'setJobName', name: 'Te Rapa'});

    expect(named.job.name).toBe('Te Rapa');
  });

  it('sets a quantity', () => {
    const next = appReducer(BASE, {
      type: 'setJobQuantity',
      pileTypeId: 'A',
      quantity: 12,
    });

    expect(next.job.lines).toEqual([{pileTypeId: 'A', quantity: 12}]);
  });

  it('drops a line set back to zero', () => {
    const withLine = appReducer(BASE, {
      type: 'setJobQuantity',
      pileTypeId: 'A',
      quantity: 12,
    });
    const cleared = appReducer(withLine, {
      type: 'setJobQuantity',
      pileTypeId: 'A',
      quantity: 0,
    });

    expect(cleared.job.lines).toEqual([]);
  });

  it('adds to existing quantities when merging an import', () => {
    const withLine = appReducer(BASE, {
      type: 'setJobQuantity',
      pileTypeId: 'A',
      quantity: 40,
    });
    const merged = appReducer(withLine, {
      type: 'importJobLines',
      lines: [
        {pileTypeId: 'A', quantity: 80},
        {pileTypeId: 'B', quantity: 5},
      ],
      replace: false,
    });

    expect(merged.job.lines).toEqual([
      {pileTypeId: 'A', quantity: 120},
      {pileTypeId: 'B', quantity: 5},
    ]);
  });

  it('overwrites everything when replacing on import', () => {
    const withLine = appReducer(BASE, {
      type: 'setJobQuantity',
      pileTypeId: 'A',
      quantity: 40,
    });
    const replaced = appReducer(withLine, {
      type: 'importJobLines',
      lines: [{pileTypeId: 'B', quantity: 5}],
      replace: true,
    });

    expect(replaced.job.lines).toEqual([{pileTypeId: 'B', quantity: 5}]);
  });

  it('clears quantities but keeps the name', () => {
    const populated = appReducer(
      appReducer(BASE, {type: 'setJobName', name: 'Te Rapa'}),
      {type: 'setJobQuantity', pileTypeId: 'A', quantity: 12},
    );
    const cleared = appReducer(populated, {type: 'clearJob'});

    expect(cleared.job.lines).toEqual([]);
    expect(cleared.job.name).toBe('Te Rapa');
  });

  it('leaves the catalogue alone', () => {
    const withType = appReducer(BASE, {
      type: 'upsertPileType',
      pileType: pileType('A'),
    });
    const next = appReducer(withType, {
      type: 'setJobQuantity',
      pileTypeId: 'A',
      quantity: 12,
    });

    expect(next.catalogue.pileTypes).toHaveLength(1);
  });
});

describe('loading options', () => {
  it('replaces the options wholesale', () => {
    const next = appReducer(BASE, {
      type: 'setOptions',
      options: {
        ...BASE.options,
        balance: {longitudinal: 150, lateral: 25},
      },
    });

    expect(next.options.balance).toEqual({longitudinal: 150, lateral: 25});
    expect(next.options.clearances).toEqual(BASE.options.clearances);
  });

  it('keeps the plan, so tightening a rule shows what it costs', () => {
    // Clearing the plan on every option change would hide the one thing worth
    // seeing: which trucks go red when the tolerance moves.
    const withPlan = appReducer(BASE, {
      type: 'setPlan',
      plan: {
        consignments: [
          {id: 'C1', vehicleId: 'RIGID-8', trailerId: null, phase: null},
        ],
        placements: [],
      },
    });
    const next = appReducer(withPlan, {
      type: 'setOptions',
      options: {...BASE.options, sideMargin: 120},
    });

    expect(next.plan.consignments).toHaveLength(1);
  });
});
