import {describe, expect, it} from '@jest/globals';
import type {Catalogue} from '../domain/catalogue';
import {PACK_MAX_WIDTH} from '../domain/packs';
import type {PileType} from '../domain/pile';
import type {Vehicle} from '../domain/vehicle';
import {DEFAULT_PACKING_OPTIONS, withoutFlips} from './options';
import {
  buildPackCandidates,
  flipPatterns,
  invertedPack,
  packFlips,
  type BuiltPack,
} from './packBuilder';

const STARTER: PileType = {
  id: 'SS200-starter',
  name: 'SS200 starter',
  length: 6000,
  shaftRadius: 84,
  mass: 178,
  helices: [{offsetFromButt: 400, radius: 225, length: 110}],
};

const EXT_LONG: PileType = {
  id: 'SS200-ext-6000',
  name: 'SS200 extension',
  length: 6000,
  shaftRadius: 84,
  mass: 132,
  helices: [],
};

const EXT_SHORT: PileType = {
  id: 'SS200-ext-3000',
  name: 'SS200 extension',
  length: 3000,
  shaftRadius: 84,
  mass: 66,
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

const CATALOGUE: Catalogue = {
  pileTypes: [STARTER, EXT_LONG, EXT_SHORT],
  vehicles: [SEMI],
};
const OPTIONS = DEFAULT_PACKING_OPTIONS;

function candidates(
  available: [string, number][],
  overrides: Partial<Parameters<typeof buildPackCandidates>[0]> = {},
): BuiltPack[] {
  return buildPackCandidates({
    available: new Map(available),
    catalogue: CATALOGUE,
    vehicle: SEMI,
    options: OPTIONS,
    headroom: 3000,
    massBudget: 28200,
    ...overrides,
  });
}

describe('flipPatterns', () => {
  it('enumerates every combination for a small pack', () => {
    expect(flipPatterns(2, true)).toHaveLength(4);
  });

  it('falls back to the four canned patterns for a big pack', () => {
    const patterns = flipPatterns(6, true);
    expect(patterns).toHaveLength(4);
    expect(patterns[2]).toEqual([true, false, true, false, true, false]);
  });

  it('offers only straight loading when flips are off', () => {
    expect(flipPatterns(3, false)).toEqual([[false, false, false]]);
  });
});

describe('buildPackCandidates', () => {
  it('lays every pile flush at the leading end, side by side', () => {
    const packs = candidates([['SS200-starter', 3]]);

    for (const pack of packs) {
      expect(new Set(pack.piles.map(pile => pile.placement.x))).toEqual(
        new Set([0]),
      );
      const ys = pack.piles.map(pile => pile.placement.y);
      expect(new Set(ys).size).toBe(ys.length);
    }
  });

  it('offers every pile count the band can hold, none wider than the limit', () => {
    const packs = candidates([['SS200-starter', 10]]);

    expect(packs.length).toBeGreaterThan(1);
    for (const pack of packs) {
      expect(pack.width).toBeLessThanOrEqual(PACK_MAX_WIDTH);
    }
    // 450 mm plates at shaft pitch via alternating flips: three fit, four
    // would pass 1.2 m.
    expect(Math.max(...packs.map(pack => pack.piles.length))).toBe(3);
  });

  it('closes a pack of twin-helix starters to shaft pitch by flipping alternates', () => {
    // Twin plates never interleave in plan, so side by side unflipped they
    // sit at plate pitch, 475 apart. Flipping one moves its plates to the
    // far end: plate against shaft, 225 + 84 + 25 = 334.
    const twin: PileType = {
      ...STARTER,
      id: 'ST200-starter',
      helices: [
        {offsetFromButt: 400, radius: 225, length: 110},
        {offsetFromButt: 1100, radius: 175, length: 110},
      ],
    };
    const catalogue: Catalogue = {pileTypes: [twin], vehicles: [SEMI]};
    const packs = candidates([['ST200-starter', 10]], {catalogue});
    const pair = packs.find(pack => pack.piles.length === 2)!;

    const [a, b] = pair.piles;
    expect(a!.placement.flipped).not.toBe(b!.placement.flipped);
    expect(Math.abs(a!.placement.y - b!.placement.y)).toBeCloseTo(334);
  });

  it('bands piles head to tail by default', () => {
    // Bare extensions: no plates to miss, so every flip pattern bands to the
    // same width. Head to tail is what the yard wants, so that is what wins.
    const packs = candidates([['SS200-ext-6000', 5]]);

    for (const pack of packs) {
      expect(packFlips(pack)).toEqual(
        pack.piles.map((_, index) => index % 2 === 1),
      );
    }
  });

  it('loads every pile the same way round when flips are off', () => {
    const packs = candidates([['SS200-ext-6000', 5]], {
      options: withoutFlips(OPTIONS),
    });

    expect(packs.length).toBeGreaterThan(1);
    for (const pack of packs) {
      expect(packFlips(pack).some(Boolean)).toBe(false);
    }
  });

  it('turns a band end for end without changing what it holds', () => {
    const pack = candidates([['SS200-starter', 3]]).find(
      candidate => candidate.piles.length === 3,
    )!;
    const turned = invertedPack(pack, OPTIONS)!;

    expect(packFlips(turned)).toEqual(packFlips(pack).map(flip => !flip));
    expect(turned.width).toBeCloseTo(pack.width);
    expect(turned.demand).toEqual(pack.demand);
  });

  it('offers mixed-length extension bundles for remainders, longest first', () => {
    const packs = candidates([
      ['SS200-ext-6000', 1],
      ['SS200-ext-3000', 1],
    ]);
    const mixed = packs.find(pack => !pack.identical);

    expect(mixed).toBeDefined();
    expect(mixed!.piles).toHaveLength(2);
    expect(mixed!.length).toBe(6000);
    expect(mixed!.piles[0]!.type.length).toBe(6000);
  });

  it('never mixes starters with extensions of the same code', () => {
    const packs = candidates([
      ['SS200-starter', 2],
      ['SS200-ext-6000', 2],
    ]);

    for (const pack of packs) {
      const parts = new Set(
        pack.piles.map(pile => (pile.type.helices.length > 0 ? 's' : 'e')),
      );
      expect(parts.size).toBe(1);
    }
  });

  it('leaves out a pile whose own tier cannot fit the headroom', () => {
    // A starter tier needs 200 of bearer + 84 + 225 = 509 mm at least.
    expect(candidates([['SS200-starter', 2]], {headroom: 400})).toEqual([]);
    expect(
      candidates([['SS200-starter', 2]], {headroom: 509}).length,
    ).toBeGreaterThan(0);
  });

  it('leaves out a pile heavier than the mass budget', () => {
    expect(candidates([['SS200-starter', 2]], {massBudget: 100})).toEqual([]);
  });
});
