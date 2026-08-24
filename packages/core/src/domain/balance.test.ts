import {describe, expect, it} from '@jest/globals';
import {balanceOffset, isBalanced, loadCentroid} from './balance';
import type {Catalogue} from './catalogue';
import {DEFAULT_LOADING_OPTIONS} from './loading';
import type {PileType} from './pile';
import type {Placement} from './placement';
import type {Vehicle} from './vehicle';

const LIGHT: PileType = {
  id: 'LIGHT',
  name: 'Light',
  length: 6000,
  shaftRadius: 84,
  mass: 100,
  helices: [],
};

const HEAVY: PileType = {...LIGHT, id: 'HEAVY', name: 'Heavy', mass: 300};

const SEMI: Vehicle = {
  id: 'SEMI-45',
  name: 'Semi',
  kind: 'semi_trailer',
  deckLength: 12500,
  deckWidth: 2450,
  payloadCapacity: 28200,
  towableBy: [],
};

const CATALOGUE: Catalogue = {pileTypes: [LIGHT, HEAVY], vehicles: [SEMI]};

function place(overrides: Partial<Placement> = {}): Placement {
  return {
    id: 'p',
    consignmentId: 'C1',
    deck: 'truck',
    pileTypeId: 'LIGHT',
    tier: 0,
    pack: 0,
    x: 0,
    y: 0,
    flipped: false,
    ...overrides,
  };
}

describe('loadCentroid', () => {
  it('puts a single pile at its own midpoint', () => {
    expect(loadCentroid([place({x: 1000})], CATALOGUE)).toEqual({
      x: 4000,
      y: 0,
      mass: 100,
    });
  });

  it('weights by mass, not by count', () => {
    // One heavy pile at 3000 outweighs one light pile at 9000 three to one.
    const centroid = loadCentroid(
      [
        place({id: 'a', pileTypeId: 'HEAVY', x: 0}),
        place({id: 'b', pileTypeId: 'LIGHT', x: 6000}),
      ],
      CATALOGUE,
    );

    expect(centroid!.x).toBe((3000 * 300 + 9000 * 100) / 400);
    expect(centroid!.mass).toBe(400);
  });

  it('averages laterally about the centreline', () => {
    const centroid = loadCentroid(
      [place({id: 'a', y: -400}), place({id: 'b', y: 800})],
      CATALOGUE,
    );

    expect(centroid!.y).toBe(200);
  });

  it('does not move when a pile is flipped end for end', () => {
    // Mass is modelled as uniform along the shaft, so flipping is a pure
    // packing lever. This is the test that fails the day PileType learns where
    // its mass actually sits.
    const upright = loadCentroid([place({x: 1000, flipped: false})], CATALOGUE);
    const flipped = loadCentroid([place({x: 1000, flipped: true})], CATALOGUE);

    expect(flipped).toEqual(upright);
  });

  it('ignores piles whose type is not in the catalogue', () => {
    expect(
      loadCentroid(
        [place({id: 'a', x: 1000}), place({id: 'b', pileTypeId: 'GHOST'})],
        CATALOGUE,
      ),
    ).toEqual({x: 4000, y: 0, mass: 100});
  });

  it('is null for an empty deck rather than dividing by zero', () => {
    expect(loadCentroid([], CATALOGUE)).toBeNull();
    expect(loadCentroid([place({pileTypeId: 'GHOST'})], CATALOGUE)).toBeNull();
  });
});

describe('balanceOffset', () => {
  it('measures against mid-deck', () => {
    const offset = balanceOffset([place({x: 0})], CATALOGUE, SEMI);

    // Centroid 3000, mid-deck 6250.
    expect(offset).toEqual({longitudinal: -3250, lateral: 0});
  });

  it('reads positive as aft and to the right', () => {
    const offset = balanceOffset([place({x: 9500, y: 300})], CATALOGUE, SEMI);

    expect(offset!.longitudinal).toBeGreaterThan(0);
    expect(offset!.lateral).toBe(300);
  });

  it('is null when there is nothing to balance', () => {
    expect(balanceOffset([], CATALOGUE, SEMI)).toBeNull();
  });
});

describe('isBalanced', () => {
  const tolerance = DEFAULT_LOADING_OPTIONS.balance;

  it('accepts an offset exactly on the tolerance', () => {
    expect(isBalanced({longitudinal: 200, lateral: -50}, tolerance)).toBe(true);
  });

  it('rejects an offset a millimetre past it, either way', () => {
    expect(isBalanced({longitudinal: 201, lateral: 0}, tolerance)).toBe(false);
    expect(isBalanced({longitudinal: 0, lateral: -51}, tolerance)).toBe(false);
  });
});
