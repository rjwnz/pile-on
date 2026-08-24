import {describe, expect, it} from '@jest/globals';
import {balancingShift, shiftToBalance} from './balance';
import {loadCentroid} from '../domain/balance';
import type {Catalogue} from '../domain/catalogue';
import type {PileType} from '../domain/pile';
import type {Placement} from '../domain/placement';
import type {Vehicle} from '../domain/vehicle';

const PILE: PileType = {
  id: 'P6',
  name: 'Six metre',
  length: 6000,
  shaftRadius: 84,
  mass: 178,
  helices: [],
};

const SEMI: Vehicle = {
  id: 'SEMI-45',
  name: 'Semi',
  kind: 'semi_trailer',
  deckLength: 12500,
  deckWidth: 2450,
  payloadCapacity: 28200,
  towableBy: [],
};

const CATALOGUE: Catalogue = {pileTypes: [PILE], vehicles: [SEMI]};

function place(overrides: Partial<Placement> = {}): Placement {
  return {
    id: 'p',
    consignmentId: 'C1',
    deck: 'truck',
    pileTypeId: 'P6',
    tier: 0,
    pack: 0,
    x: 0,
    y: 0,
    flipped: false,
    ...overrides,
  };
}

describe('balancingShift', () => {
  it('moves a short load exactly onto the balance point', () => {
    // One pile at 100–6100 has its centroid at 3100; mid-deck is 6250.
    expect(balancingShift([place({x: 100})], CATALOGUE, SEMI)).toBe(3150);
  });

  it('stops at the rear of what the vehicle may carry', () => {
    // The load already ends at 12200, leaving 300 mm before the deck runs out.
    const full = [place({id: 'a', x: 100}), place({id: 'b', x: 6200})];

    expect(balancingShift(full, CATALOGUE, SEMI)).toBe(100);
  });

  it('will move a load forward as readily as aft', () => {
    expect(balancingShift([place({x: 6500})], CATALOGUE, SEMI)).toBe(-3250);
    expect(balancingShift([place({x: 2000})], CATALOGUE, SEMI)).toBe(1250);
  });

  it('stops at the headboard on the way forward', () => {
    // Mass sits aft, so the load wants to slide forward onto mid-deck — but a
    // pile already hard against the headboard has only 100 mm to give, and it
    // pins the whole load there.
    const load = [
      place({id: 'front', x: 100}),
      place({id: 'a', x: 6500}),
      place({id: 'b', x: 6500}),
      place({id: 'c', x: 6500}),
    ];

    expect(balancingShift(load, CATALOGUE, SEMI)).toBe(-100);
  });

  it('does not move a load that is already where it should be', () => {
    expect(balancingShift([place({x: 3250})], CATALOGUE, SEMI)).toBe(0);
  });

  it('gives up rather than guessing when the load cannot fit the deck', () => {
    const overlong: PileType = {...PILE, id: 'LONG', length: 14000};
    const catalogue: Catalogue = {pileTypes: [overlong], vehicles: [SEMI]};

    expect(balancingShift([place({pileTypeId: 'LONG'})], catalogue, SEMI)).toBe(
      0,
    );
  });

  it('has nothing to do with an empty or unresolvable load', () => {
    expect(balancingShift([], CATALOGUE, SEMI)).toBe(0);
    expect(
      balancingShift([place({pileTypeId: 'GHOST'})], CATALOGUE, SEMI),
    ).toBe(0);
  });

  it('measures the extent from the piles it can resolve', () => {
    // The ghost has no length, so it cannot be allowed to pin either end.
    const mixed = [
      place({id: 'a', x: 100}),
      place({id: 'ghost', x: 9000, pileTypeId: 'GHOST'}),
    ];

    expect(balancingShift(mixed, CATALOGUE, SEMI)).toBe(3150);
  });
});

describe('shiftToBalance', () => {
  it('lands the centroid on the target when there is room', () => {
    const shifted = shiftToBalance([place({x: 100})], CATALOGUE, SEMI);

    expect(loadCentroid(shifted, CATALOGUE)!.x).toBe(6250);
  });

  it('moves every pile by the same amount, so the layout is untouched', () => {
    const before = [
      place({id: 'a', x: 100, y: -400, tier: 0}),
      place({id: 'b', x: 100, y: 400, tier: 1}),
    ];
    const after = shiftToBalance(before, CATALOGUE, SEMI);

    expect(after.map(p => p.x - 3150)).toEqual(before.map(p => p.x));
    expect(after.map(p => [p.y, p.tier])).toEqual(
      before.map(p => [p.y, p.tier]),
    );
  });

  it('returns the placements unchanged when no shift helps', () => {
    const load = [place({x: 3250})];

    expect(shiftToBalance(load, CATALOGUE, SEMI)).toEqual(load);
  });
});
