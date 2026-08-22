import {GEOMETRIC_EPSILON, type Millimetres} from '../units';
import {helicesMayInterleave} from '../domain/pile';
import type {ClearanceOptions} from '../domain/loading';
import type {PlacedPile} from '../domain/placement';
import {breakpoints, helixRadiusAt, radiusProfile} from './profile';

export interface SeparationOptions {
  readonly clearances: ClearanceOptions;
}

/**
 * The minimum distance two parallel pile axes may be apart.
 *
 * The rule, station by station along the deck:
 *
 *   1. Shafts are absolute. Wherever two piles overlap longitudinally they must
 *      be at least `shaftA + shaftB + shaftToShaft` apart — no exceptions, ever.
 *   2. A helix may never overlap a neighbour's *shaft*. Where one pile presents
 *      a helix and the other presents bare shaft, the requirement is
 *      `helixA + shaftB + helixToShaft`.
 *   3. Where both piles present a helix at the same station, the requirement is
 *      `helixA + helixB + helixToHelix` — *unless* both piles are single-helix,
 *      in which case the plates interleave horizontally at the same level and
 *      may overlap in plan. Then rule 2 binds on each side and the requirement
 *      relaxes to `max(helixA + shaftB, shaftA + helixB) + helixToShaft`.
 *
 * A double-helix pile gets no relaxation against any neighbour, single or
 * double.
 *
 * Rule 2 is what makes longitudinal staggering worth doing: sliding one pile so
 * its plates miss the neighbour's plates drops the requirement from
 * `helixA + helixB` to `max(helixA + shaftB, shaftA + helixB)` — for a 400 mm
 * helix on a 100 mm shaft, from 400 mm apart to 250 mm apart.
 *
 * The clearance is added *inside* the max rather than once at the end, because
 * which clearance applies depends on which case the station is in. With all
 * three set equal this is arithmetically identical to adding one at the end.
 *
 * This is a distance between axes, not a lateral gap: two piles of different
 * diameter sit at different heights in the same tier, and that vertical offset
 * counts. `requiredLateralSeparation` turns it into a `Δy` for a known `Δz`.
 *
 * Returns 0 when the piles never overlap longitudinally, meaning they may share
 * a lane end-to-end at the same `y`.
 */
export function requiredAxisDistance(
  a: PlacedPile,
  b: PlacedPile,
  options: SeparationOptions,
): Millimetres {
  const profileA = radiusProfile(a);
  const profileB = radiusProfile(b);

  const [startA, endA] = [a.placement.x, a.placement.x + a.type.length];
  const [startB, endB] = [b.placement.x, b.placement.x + b.type.length];

  const overlapStart = Math.max(startA, startB);
  const overlapEnd = Math.min(endA, endB);
  if (overlapEnd <= overlapStart) {
    return 0;
  }

  const {clearances} = options;
  const mayInterleave = helicesMayInterleave(a.type, b.type);
  const shaftA = a.type.shaftRadius;
  const shaftB = b.type.shaftRadius;

  // The shaft floor holds at every station, whatever the plates are doing, and
  // the interleaved case can only ever relax down to it — never below, however
  // odd the catalogue data is.
  const shaftFloor = shaftA + shaftB + clearances.shaftToShaft;
  let required = shaftFloor;

  const points = breakpoints(profileA, profileB).filter(
    point => point >= overlapStart && point < overlapEnd,
  );

  for (const point of points) {
    // Sample just inside the interval that starts here: between breakpoints
    // both profiles are constant, so one sample settles the whole interval.
    const helixA = helixRadiusAt(profileA, point);
    const helixB = helixRadiusAt(profileB, point);

    let atStation: Millimetres;
    if (helixA > 0 && helixB > 0) {
      atStation = mayInterleave
        ? Math.max(helixA + shaftB, shaftA + helixB) + clearances.helixToShaft
        : helixA + helixB + clearances.helixToHelix;
    } else if (helixA > 0 || helixB > 0) {
      atStation =
        Math.max(shaftA, helixA) +
        Math.max(shaftB, helixB) +
        clearances.helixToShaft;
    } else {
      atStation = shaftFloor;
    }

    required = Math.max(required, atStation);
  }

  return required;
}

/**
 * The minimum `|Δy|` two piles may be placed at, given a known vertical offset
 * between their axes.
 *
 * Piles are parallel cylinders, so what has to be respected is the distance
 * between their axes. Any height difference is distance already spent: a pile
 * whose plates put its axis 275 mm higher than its neighbour's needs
 * correspondingly less room across the deck. At `deltaZ = 0` this is exactly
 * `requiredAxisDistance`.
 */
export function requiredLateralSeparation(
  a: PlacedPile,
  b: PlacedPile,
  options: SeparationOptions,
  deltaZ: Millimetres = 0,
): Millimetres {
  const distance = requiredAxisDistance(a, b, options);
  if (distance === 0) {
    return 0;
  }
  return Math.sqrt(Math.max(0, distance * distance - deltaZ * deltaZ));
}

/** Whether two placed piles are far enough apart to coexist in a tier. */
export function lateralSeparationOk(
  a: PlacedPile,
  b: PlacedPile,
  options: SeparationOptions,
  deltaZ: Millimetres = 0,
): boolean {
  const gap = Math.abs(a.placement.y - b.placement.y);
  return (
    gap + GEOMETRIC_EPSILON >= requiredLateralSeparation(a, b, options, deltaZ)
  );
}

/**
 * Whether two placed piles conflict. Piles in different tiers never conflict —
 * dunnage carries the layer above, so vertical stacking is a tier concern, not
 * a pairwise one.
 */
export function pilesConflict(
  a: PlacedPile,
  b: PlacedPile,
  options: SeparationOptions,
  deltaZ: Millimetres = 0,
): boolean {
  if (a.placement.tier !== b.placement.tier) {
    return false;
  }
  return !lateralSeparationOk(a, b, options, deltaZ);
}
