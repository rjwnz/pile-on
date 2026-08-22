import {
  requiredLateralSeparation,
  type PileType,
  type PlacedPile,
  type SeparationOptions,
} from '@pile-on/core';

/**
 * A hard-coded two-pile example, used by the placeholder home page to prove the
 * app is wired to the engine and to show the staggering effect the whole
 * project exists to exploit.
 *
 * Delete this once real jobs can be loaded from CSV.
 */

export const DEMO_DECK_LENGTH = 12600;
export const DEMO_DECK_WIDTH = 2550;
export const DEMO_CLEARANCE: SeparationOptions = {clearance: 25};

export const DEMO_PILE_TYPE: PileType = {
  id: 'sp-168-d',
  name: 'SP168 double helix',
  length: 6000,
  shaftRadius: 84,
  mass: 310,
  helices: [
    {offsetFromButt: 400, radius: 225, thickness: 110},
    {offsetFromButt: 1100, radius: 175, thickness: 110},
  ],
};

/** The demo pair with the second pile slid `secondPileOffset` mm down the deck. */
export function pairAtOffset(secondPileOffset: number): PlacedPile[] {
  const first: PlacedPile = {
    type: DEMO_PILE_TYPE,
    placement: {pileId: 'a', tier: 0, x: 300, y: 0, flipped: false},
  };
  const separation = requiredLateralSeparation(
    first,
    {
      type: DEMO_PILE_TYPE,
      placement: {
        pileId: 'b',
        tier: 0,
        x: 300 + secondPileOffset,
        y: 0,
        flipped: false,
      },
    },
    DEMO_CLEARANCE,
  );

  return [
    {
      ...first,
      placement: {...first.placement, y: -separation / 2},
    },
    {
      type: DEMO_PILE_TYPE,
      placement: {
        pileId: 'b',
        tier: 0,
        x: 300 + secondPileOffset,
        y: separation / 2,
        flipped: false,
      },
    },
  ];
}

/** Both piles butted to the same start: every plate shares a station. */
export const ALIGNED_PAIR = pairAtOffset(0);

/**
 * Second pile slid 350 mm down the deck, so no plate shares a station.
 *
 * The offset is not arbitrary, and eyeballing it does not work. Plates sit at
 * 400 mm and 1100 mm from the butt and are 110 mm thick, so an offset conflicts
 * whenever it lands within 110 mm of 0 or of the 700 mm plate spacing. An
 * offset of 800 mm looks generous and is in fact worse than useless: pile A's
 * second plate still catches pile B's first.
 */
export const STAGGERED_PAIR = pairAtOffset(350);

export function separationOf(piles: readonly PlacedPile[]): number {
  const [a, b] = piles;
  if (!a || !b) {
    return 0;
  }
  return Math.abs(a.placement.y - b.placement.y);
}
