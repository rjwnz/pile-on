import {describe, expect, it} from '@jest/globals';
import {
  ALIGNED_PAIR,
  DEMO_PILE_TYPE,
  STAGGERED_PAIR,
  separationOf,
  pairAtOffset,
} from './staggerDemo';

describe('stagger demo', () => {
  it('separates the aligned pair by the full plate-to-plate distance', () => {
    // Plates at 225 and 175 mm radius, both piles at the same station, plus
    // 25 mm clearance: the widest pair is 225 + 225 + 25.
    expect(separationOf(ALIGNED_PAIR)).toBe(475);
  });

  it('closes the staggered pair up to plate-to-shaft distance', () => {
    // Widest plate 225 against an 84 mm shaft, plus 25 mm clearance.
    expect(separationOf(STAGGERED_PAIR)).toBe(334);
  });

  it('is not fooled by an offset that only looks staggered', () => {
    // 800 mm still lets A's second plate catch B's first: the plates are
    // 700 mm apart on the shaft and 110 mm thick.
    expect(separationOf(pairAtOffset(800))).toBe(
      separationOf(pairAtOffset(0)) - 50,
    );
    expect(separationOf(pairAtOffset(800))).toBeGreaterThan(
      separationOf(STAGGERED_PAIR),
    );
  });

  it('demonstrates a real saving, which is the point of the whole project', () => {
    expect(separationOf(STAGGERED_PAIR)).toBeLessThan(
      separationOf(ALIGNED_PAIR),
    );
  });

  it('keeps both piles inside the deck width', () => {
    for (const placed of [...ALIGNED_PAIR, ...STAGGERED_PAIR]) {
      expect(Math.abs(placed.placement.y)).toBeLessThan(2550 / 2);
    }
  });

  it('uses a double-helix type, so no interleaving relaxation applies', () => {
    expect(DEMO_PILE_TYPE.helices).toHaveLength(2);
  });

  it('returns zero separation for a degenerate pair', () => {
    expect(separationOf([])).toBe(0);
    expect(separationOf([ALIGNED_PAIR[0]!])).toBe(0);
  });
});
