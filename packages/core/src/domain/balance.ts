import {GEOMETRIC_EPSILON, type Kilograms, type Millimetres} from '../units';
import type {Catalogue} from './catalogue';
import {findPileType} from './catalogue';
import type {BalanceTolerance} from './loading';
import type {Placement} from './placement';
import {balanceTargetOf, type Vehicle} from './vehicle';

/**
 * Where the mass of a load actually sits.
 *
 * This is the whole of the even-distribution requirement. Axle reactions were
 * scoped out because payload always binds first, and the statics they needed
 * went with them — but balance never needed axle geometry in the first place. A
 * centroid is a weighted mean: cheap to compute, cheap to recompute on every
 * edit, and linear in the layout, which is what makes it repairable after the
 * fact rather than something the packer has to get right first time.
 */
export interface Centroid {
  /** Along the deck, from the headboard. */
  readonly x: Millimetres;
  /** Across the deck, from the centreline; positive to the driver's right. */
  readonly y: Millimetres;
  readonly mass: Kilograms;
}

/**
 * Centroid of the piles on a deck, or null when there is no mass to speak of.
 *
 * A pile's own centre of mass is taken as its midpoint. `PileType` carries one
 * total mass and no distribution, so there is nothing better available — and
 * the helices, which are the part that would skew it toward the butt, are also
 * the part the model does not weigh separately. The practical consequence is
 * that flipping a pile does not move the centroid, which keeps head-to-toe
 * flipping a pure packing lever with no balance side effect.
 *
 * Bearers and lashings are left out: they run the width of the deck at regular
 * spacing, so they pull toward the middle rather than away from it.
 */
export function loadCentroid(
  placements: readonly Placement[],
  catalogue: Catalogue,
): Centroid | null {
  let mass = 0;
  let momentX = 0;
  let momentY = 0;

  for (const placement of placements) {
    const type = findPileType(catalogue, placement.pileTypeId);
    if (!type) {
      continue;
    }
    mass += type.mass;
    momentX += type.mass * (placement.x + type.length / 2);
    momentY += type.mass * placement.y;
  }

  if (mass <= 0) {
    return null;
  }
  return {x: momentX / mass, y: momentY / mass, mass};
}

/** How far the load sits from where the deck wants it. Signed. */
export interface BalanceOffset {
  /** Along the deck. Positive is aft of the target. */
  readonly longitudinal: Millimetres;
  /** Across the deck. Positive is to the driver's right of the centreline. */
  readonly lateral: Millimetres;
}

export function balanceOffset(
  placements: readonly Placement[],
  catalogue: Catalogue,
  vehicle: Vehicle,
): BalanceOffset | null {
  const centroid = loadCentroid(placements, catalogue);
  if (!centroid) {
    return null;
  }
  return {
    longitudinal: centroid.x - balanceTargetOf(vehicle),
    lateral: centroid.y,
  };
}

export function isBalanced(
  offset: BalanceOffset,
  tolerance: BalanceTolerance,
): boolean {
  // The same slack every other geometric comparison gets. A centroid is a
  // division, so a load the packer put exactly on its tolerance can land a
  // fraction of a nanometre outside it, and rejecting that would be nonsense.
  return (
    Math.abs(offset.longitudinal) <=
      tolerance.longitudinal + GEOMETRIC_EPSILON &&
    Math.abs(offset.lateral) <= tolerance.lateral + GEOMETRIC_EPSILON
  );
}
