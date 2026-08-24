import type {Kilograms, Millimetres} from '../units';

/**
 * New Zealand general-access limits from Land Transport Rule: Vehicle
 * Dimensions and Mass 2016.
 *
 * These are DATA, not logic, and they move (NZTA removed 50MAX permits on
 * 6 August 2026). Every quote records the ruleset version that produced it;
 * add a new version alongside the old rather than editing in place. Axle and
 * bridge-formula limits are deliberately absent — payload is always reached
 * first in this operation.
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
