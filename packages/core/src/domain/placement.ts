import type {Millimetres} from '../units';
import type {PileType} from './pile';

/** Which deck of a movement a pile rides on. */
export type DeckRole = 'truck' | 'trailer';

/**
 * Deck coordinate system, used everywhere:
 *
 *   x — along the deck, 0 at *that deck's* headboard, increasing toward the
 *       rear. A movement's truck and trailer decks each have their own origin.
 *   y — across the deck, 0 on the centreline, positive to the driver's right.
 *   tier — 0 is the bottom layer on the deck; each tier sits on dunnage.
 *
 * Piles always lie parallel to x. The only orientation freedom is `flipped`,
 * which swaps which end faces the headboard — cheap in the yard, and the main
 * lever for getting helices off each other's stations.
 */
export interface Placement {
  /** A placement *is* an individual pile on a deck — there is no separate
   * pile registry. */
  readonly id: string;
  /** Which movement this pile rides on. */
  readonly consignmentId: string;
  /** Which of that movement's decks it sits on. */
  readonly deck: DeckRole;
  readonly pileTypeId: string;
  readonly tier: number;
  /**
   * Which pack of its tier this pile is banded into: 0 for the first, 1 for
   * the second. A pack is a single-type, single-layer bundle at most
   * `PACK_MAX_WIDTH` wide; a tier holds at most two, side by side.
   */
  readonly pack: number;
  /** Position of the pile's leading (headboard-most) end. */
  readonly x: Millimetres;
  /** Lateral position of the shaft axis. */
  readonly y: Millimetres;
  /** True when the tip, rather than the butt, faces the headboard. */
  readonly flipped: boolean;
}

/** A placement paired with the geometry it refers to. */
export interface PlacedPile {
  readonly type: PileType;
  readonly placement: Placement;
}
