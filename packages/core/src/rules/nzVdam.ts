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
 * Sources:
 *   NZTA factsheet 13  — Vehicle dimensions and mass (May 2021)
 *   NZTA factsheet 53a — Overdimension vehicles and loads (Feb 2017)
 */

export interface BridgeFormulaBand {
  /** Inclusive lower bound on the distance from first to last axle centre. */
  readonly fromSpan: Millimetres;
  /** Minimum number of axles required to claim this band. */
  readonly minAxles: number;
  readonly limit: Kilograms;
}

export interface VdamRuleset {
  readonly version: string;
  readonly effectiveFrom: string;
  readonly maxWidth: Millimetres;
  readonly maxHeight: Millimetres;
  /** Shortest span the combined axle-set table applies to. */
  readonly bridgeFormulaMinSpan: Millimetres;
  readonly bridgeFormula: readonly BridgeFormulaBand[];
  /** Minimum share of total axle mass that must sit on the front axles. */
  readonly minFrontAxleMassShare: number;
  /** Gross mass of towed vehicle / gross mass of towing vehicle. */
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

  bridgeFormulaMinSpan: 1800,
  bridgeFormula: Object.freeze([
    {fromSpan: 1800, minAxles: 2, limit: 15500},
    {fromSpan: 2500, minAxles: 2, limit: 17500},
    {fromSpan: 3000, minAxles: 2, limit: 19000},
    {fromSpan: 3300, minAxles: 2, limit: 20000},
    {fromSpan: 3600, minAxles: 2, limit: 21000},
    {fromSpan: 4000, minAxles: 2, limit: 22000},
    {fromSpan: 4400, minAxles: 2, limit: 23000},
    {fromSpan: 4700, minAxles: 2, limit: 24000},
    {fromSpan: 5100, minAxles: 2, limit: 25000},
    {fromSpan: 5400, minAxles: 2, limit: 26000},
    {fromSpan: 5800, minAxles: 2, limit: 27000},
    {fromSpan: 6400, minAxles: 2, limit: 28000},
    {fromSpan: 7000, minAxles: 2, limit: 29000},
    {fromSpan: 7600, minAxles: 2, limit: 30000},
    {fromSpan: 8200, minAxles: 2, limit: 31000},
    {fromSpan: 8800, minAxles: 2, limit: 32000},
    {fromSpan: 9400, minAxles: 2, limit: 33000},
    {fromSpan: 10000, minAxles: 2, limit: 34000},
    {fromSpan: 10800, minAxles: 2, limit: 35000},
    {fromSpan: 11600, minAxles: 2, limit: 36000},
    {fromSpan: 12000, minAxles: 2, limit: 37000},
    {fromSpan: 12500, minAxles: 2, limit: 38000},
    {fromSpan: 13200, minAxles: 2, limit: 39000},
    {fromSpan: 14000, minAxles: 2, limit: 40000},
    {fromSpan: 14800, minAxles: 2, limit: 41000},
    {fromSpan: 15200, minAxles: 2, limit: 42000},
    {fromSpan: 15600, minAxles: 2, limit: 43000},
    {fromSpan: 16000, minAxles: 2, limit: 44000},
    {fromSpan: 16800, minAxles: 7, limit: 45000},
    {fromSpan: 17400, minAxles: 8, limit: 46000},
  ]),

  minFrontAxleMassShare: 0.2,
  maxTrailerToTruckMassRatio: 1.5,
  minStaticRollThreshold: 0.35,
  trailerSrtCertificationHeight: 2800,
});

/**
 * Combined axle-set ("bridge formula") mass limit for a span.
 *
 * Returns `null` below 1.8 m, where the table does not apply and the individual
 * axle and axle-set limits govern instead. Callers must handle `null` rather
 * than treating it as unlimited.
 */
export function bridgeFormulaLimit(
  span: Millimetres,
  axleCount: number,
  ruleset: VdamRuleset = NZ_VDAM_2016,
): Kilograms | null {
  if (span < ruleset.bridgeFormulaMinSpan) {
    return null;
  }

  let limit: Kilograms | null = null;
  for (const band of ruleset.bridgeFormula) {
    if (span >= band.fromSpan && axleCount >= band.minAxles) {
      limit = Math.max(limit ?? 0, band.limit);
    }
  }
  return limit;
}

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
