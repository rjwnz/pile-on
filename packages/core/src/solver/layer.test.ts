import {describe, expect, it} from '@jest/globals';
import type {Catalogue} from '../domain/catalogue';
import type {PileType} from '../domain/pile';
import type {PlacedPile} from '../domain/placement';
import {packTier} from './layer';
import {DEFAULT_PACKING_OPTIONS, withoutFlips} from './options';
import {SEMI} from '../testFixtures';

const EXT: PileType = {
  id: 'SS200-ext-6000',
  name: 'SS200 extension',
  length: 6000,
  shaftRadius: 84,
  mass: 132,
  helices: [],
};

const CATALOGUE: Catalogue = {pileTypes: [EXT], vehicles: [SEMI]};

function tier(quantity: number, options = DEFAULT_PACKING_OPTIONS) {
  return packTier({
    available: new Map([[EXT.id, quantity]]),
    catalogue: CATALOGUE,
    vehicle: SEMI,
    options,
    headroom: 3000,
    massBudget: 28200,
    support: null,
    below: null,
  });
}

/** Which way each pile of a tier faces, read across the deck. */
function acrossTheDeck(placements: readonly PlacedPile[]): boolean[] {
  return [...placements]
    .sort((a, b) => a.placement.y - b.placement.y)
    .map(pile => pile.placement.flipped);
}

describe('packTier', () => {
  it('reads head to tail all the way across a row, packs included', () => {
    // Six bare extensions band as two packs of three side by side. Each pack
    // alternates on its own; the second is turned end for end so the run
    // carries on across the join instead of putting two like ends together.
    const laid = tier(6);

    expect(laid.packs).toBe(2);
    expect(new Set(laid.placements.map(pile => pile.placement.x)).size).toBe(1);
    const facing = acrossTheDeck(laid.placements);
    expect(facing).toEqual([false, true, false, true, false, true]);
  });

  it('leaves the row alone when flips are off', () => {
    const laid = tier(6, withoutFlips(DEFAULT_PACKING_OPTIONS));

    expect(acrossTheDeck(laid.placements).some(Boolean)).toBe(false);
  });
});
