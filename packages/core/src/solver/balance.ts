import {loadCentroid} from '../domain/balance';
import type {Catalogue} from '../domain/catalogue';
import {findPileType} from '../domain/catalogue';
import type {Placement} from '../domain/placement';
import {balanceTargetOf, type Vehicle} from '../domain/vehicle';
import type {Millimetres} from '../units';

/**
 * Slide a whole load along the deck to bring its centroid onto the balance
 * target.
 *
 * This is the cheapest balance repair there is and the first one to reach for.
 * The centroid moves one-for-one with the shift, so the correction is a single
 * subtraction rather than a search, and because every pile moves by the same
 * amount nothing else about the layout changes — separations, tier support and
 * pack structure are all preserved exactly.
 *
 * The shift is clamped to keep the load inside what the vehicle may carry, so a
 * load that is long enough to pin both ends simply does not move. That is not a
 * failure: it means the shift lever is spent and the imbalance has to come out
 * of which pile sits where instead.
 */
export function shiftToBalance(
  placements: readonly Placement[],
  catalogue: Catalogue,
  vehicle: Vehicle,
): Placement[] {
  const shift = balancingShift(placements, catalogue, vehicle);
  if (shift === 0) {
    return [...placements];
  }
  return placements.map(placement => ({...placement, x: placement.x + shift}));
}

/** How far the load may and should slide; 0 when it cannot help. */
export function balancingShift(
  placements: readonly Placement[],
  catalogue: Catalogue,
  vehicle: Vehicle,
): Millimetres {
  const centroid = loadCentroid(placements, catalogue);
  if (!centroid) {
    return 0;
  }

  // A centroid exists, so at least one pile resolved and these are finite.
  // Piles whose type is missing are skipped rather than pinning the extent to
  // a length nobody knows.
  let start = Infinity;
  let end = -Infinity;
  for (const placement of placements) {
    const type = findPileType(catalogue, placement.pileTypeId);
    if (!type) {
      continue;
    }
    start = Math.min(start, placement.x);
    end = Math.max(end, placement.x + type.length);
  }

  // Headboard to tailgate, no overhang.
  const lowest = -start;
  const highest = vehicle.deckLength - end;
  if (lowest > highest) {
    // The load does not fit the span at all. Moving it cannot make that better,
    // and the envelope check is what should be reporting it.
    return 0;
  }

  const wanted = balanceTargetOf(vehicle) - centroid.x;
  return Math.min(Math.max(wanted, lowest), highest);
}
