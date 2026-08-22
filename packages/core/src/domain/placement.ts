import type {Millimetres} from '../units';
import type {PileType} from './pile';

/**
 * Deck coordinate system, used everywhere:
 *
 *   x — along the deck, 0 at the headboard, increasing toward the rear.
 *   y — across the deck, 0 on the centreline, positive to the driver's right.
 *   tier — 0 is the bottom layer on the deck; each tier sits on dunnage.
 *
 * Piles always lie parallel to x. The only orientation freedom is `flipped`,
 * which swaps which end faces the headboard — cheap in the yard, and the main
 * lever for getting helices off each other's stations.
 */
export interface Placement {
  /**
   * Identity of this placement within the plan.
   *
   * A placement *is* an individual pile on a deck — there is no separate pile
   * registry. The job holds quantities per type; what makes one of those 400
   * piles distinguishable is being placed somewhere.
   */
  readonly id: string;
  readonly pileTypeId: string;
  readonly tier: number;
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

/** Longitudinal extent of a placed pile, as [start, end] along the deck. */
export function extentOf(
  placed: PlacedPile,
): readonly [Millimetres, Millimetres] {
  return [placed.placement.x, placed.placement.x + placed.type.length];
}
