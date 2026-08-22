import {GEOMETRIC_EPSILON, type Millimetres} from '../units';
import {helicesMayInterleave} from '../domain/pile';
import type {PlacedPile} from '../domain/placement';
import {breakpoints, helixRadiusAt, radiusProfile} from './profile';

export interface SeparationOptions {
  /** Minimum steel-to-steel gap between neighbouring piles. */
  readonly clearance: Millimetres;
}

/**
 * The minimum centre-to-centre lateral distance two piles may be placed at.
 *
 * The rule, station by station along the deck:
 *
 *   1. Shafts are absolute. Wherever two piles overlap longitudinally they must
 *      be at least `shaftA + shaftB` apart — no exceptions, ever.
 *   2. A helix may never overlap a neighbour's *shaft*. Where one pile presents
 *      a helix and the other presents bare shaft, the requirement is
 *      `helixA + shaftB`.
 *   3. Where both piles present a helix at the same station, the requirement is
 *      `helixA + helixB` — *unless* both piles are single-helix, in which case
 *      the plates interleave horizontally at the same level and may overlap in
 *      plan. Then rule 2 binds on each side and the requirement relaxes to
 *      `max(helixA + shaftB, shaftA + helixB)`.
 *
 * A double-helix pile gets no relaxation against any neighbour, single or
 * double.
 *
 * Rule 2 is what makes longitudinal staggering worth doing: sliding one pile so
 * its plates miss the neighbour's plates drops the requirement from
 * `helixA + helixB` to `max(helixA + shaftB, shaftA + helixB)` — for a 400 mm
 * helix on a 100 mm shaft, from 400 mm apart to 250 mm apart.
 *
 * Returns 0 when the piles never overlap longitudinally, meaning they may share
 * a lane end-to-end at the same `y`.
 */
export function requiredLateralSeparation(
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

  const mayInterleave = helicesMayInterleave(a.type, b.type);
  const shaftFloor = a.type.shaftRadius + b.type.shaftRadius;

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
    if (helixA > 0 && helixB > 0 && mayInterleave) {
      atStation = Math.max(
        helixA + b.type.shaftRadius,
        a.type.shaftRadius + helixB,
      );
    } else {
      atStation =
        Math.max(a.type.shaftRadius, helixA) +
        Math.max(b.type.shaftRadius, helixB);
    }

    // The interleaved case can only ever relax down to the shaft floor, never
    // below it, however odd the catalogue data is.
    required = Math.max(required, atStation, shaftFloor);
  }

  return required + options.clearance;
}

/** Whether two placed piles are far enough apart laterally to coexist in a tier. */
export function lateralSeparationOk(
  a: PlacedPile,
  b: PlacedPile,
  options: SeparationOptions,
): boolean {
  const gap = Math.abs(a.placement.y - b.placement.y);
  return gap + GEOMETRIC_EPSILON >= requiredLateralSeparation(a, b, options);
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
): boolean {
  if (a.placement.tier !== b.placement.tier) {
    return false;
  }
  return !lateralSeparationOk(a, b, options);
}
