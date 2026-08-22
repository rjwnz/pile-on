import type {Kilograms, Millimetres} from '../units';

/**
 * New Zealand general-access limits from Land Transport Rule: Vehicle
 * Dimensions and Mass 2016.
 *
 * These are DATA, not logic, and they move: NZTA removed 50MAX permits on
 * 6 August 2026, with further VDAM phases consulted on from October 2026.
 * Every quote must record which ruleset version produced it, so that an old
 * quote can still be explained after the rules change. Add a new version
 * alongside the old one rather than editing in place.
 *
 * Axle and axle-set limits, and the combined axle-set ("bridge formula") table,
 * are deliberately absent. A vehicle's total payload limit is always reached
 * first in this operation, so carrying those limits meant modelling axle
 * positions and tyre classes for a constraint that never binds. If that
 * assumption ever stops holding — much heavier piles, or shorter-wheelbase
 * units — they come back here, as a new ruleset version.
 *
 * Sources:
 *   NZTA factsheet 13  — Vehicle dimensions and mass (May 2021)
 *   NZTA factsheet 53a — Overdimension vehicles and loads (Feb 2017)
 */

export interface VdamRuleset {
  readonly version: string;
  readonly effectiveFrom: string;
  readonly maxWidth: Millimetres;
  readonly maxHeight: Millimetres;
  /** Gross mass ceiling on an unrestricted Class 1 route. */
  readonly maxGrossMass: Kilograms;
  /** Gross mass of the towed vehicle over gross mass of the towing vehicle. */
  readonly maxTrailerToTruckMassRatio: number;
  /** Minimum static roll threshold, in g. */
  readonly minStaticRollThreshold: number;
  /** Load or body height above which a heavy trailer must be SRT certified. */
  readonly trailerSrtCertificationHeight: Millimetres;
}

export const NZ_VDAM_2016: VdamRuleset = Object.freeze({
  version: 'nz-vdam-2016',
  effectiveFrom: '2017-02-01',

  maxWidth: 2550,
  maxHeight: 4300,
  maxGrossMass: 44000,

  maxTrailerToTruckMassRatio: 1.5,
  minStaticRollThreshold: 0.35,
  trailerSrtCertificationHeight: 2800,
});

/** Whether a loaded width is within general access, before any permit. */
export function isOverWidth(
  width: Millimetres,
  ruleset: VdamRuleset = NZ_VDAM_2016,
): boolean {
  return width > ruleset.maxWidth;
}

/** Whether a loaded height (deck height plus load) is within general access. */
export function isOverHeight(
  height: Millimetres,
  ruleset: VdamRuleset = NZ_VDAM_2016,
): boolean {
  return height > ruleset.maxHeight;
}

/**
 * Whether a gross mass is above general access and so needs an HPMV permit.
 *
 * Note this is the *route* limit. A vehicle's own rated gross mass may be lower,
 * and the binding figure is whichever is smaller — see `payloadCapacity`.
 */
export function isOverGrossMass(
  mass: Kilograms,
  ruleset: VdamRuleset = NZ_VDAM_2016,
): boolean {
  return mass > ruleset.maxGrossMass;
}

/**
 * A load of more than one pile is divisible.
 *
 * This matters more than it looks. Overdimension permits are only available for
 * *indivisible* loads, so a multi-pile load cannot be permitted overwidth or
 * overheight at all — it has to fit general access, or go on an HPMV permit
 * (which allows overlength and overweight, but never overwidth or overheight).
 */
export function isDivisibleLoad(pileCount: number): boolean {
  return pileCount > 1;
}
