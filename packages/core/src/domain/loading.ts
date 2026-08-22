import type {Kilograms, Millimetres} from '../units';
import {maxRadius, type PileType} from './pile';
import type {PlacedPile, Placement} from './placement';
import type {Catalogue} from './catalogue';
import {findPileType} from './catalogue';

/**
 * Minimum steel-to-steel gaps, by which two surfaces are meeting. Three
 * numbers because the cases are physically different; equal values collapse to
 * a single clearance.
 */
export interface ClearanceOptions {
  /** Shaft to shaft — the absolute floor, wherever two piles overlap. */
  readonly shaftToShaft: Millimetres;
  /** A helix plate passing a neighbour's bare shaft. */
  readonly helixToShaft: Millimetres;
  /** Two plates at the same station, when they cannot interleave. */
  readonly helixToHelix: Millimetres;
}

/**
 * How far the load centroid may sit from where the deck wants it. Stands in
 * for axle-set limits this model deliberately does not carry, so the defaults
 * err tight: too tight rejects visibly, too loose accepts silently. See
 * docs/01-packer-design.md §4.6.
 */
export interface BalanceTolerance {
  /** Along the deck, from the vehicle's balance target. */
  readonly longitudinal: Millimetres;
  /** Across the deck, from the centreline. */
  readonly lateral: Millimetres;
}

/**
 * How this yard loads a truck, and what makes a load legal. Shared by the
 * arranger, the packer and the validator so what gets built and what gets
 * checked cannot drift apart; search-only knobs live in `PackingOptions`.
 */
export interface LoadingOptions {
  readonly clearances: ClearanceOptions;
  readonly balance: BalanceTolerance;
  /** Hardwood bearers under each tier — 100 × 100 per the Truck Loading Code. */
  readonly dunnageThickness: Millimetres;
  /** Gap between piles laid end to end in the same lane. */
  readonly endGap: Millimetres;
  /** Clear space kept between the load and each side of the deck. */
  readonly sideMargin: Millimetres;
  /** Clear space between the headboard and the front of the load. */
  readonly headboardGap: Millimetres;
  /** Practical ceiling on tiers, whatever the height limit allows. */
  readonly maxTiers: number;
  /** Bearers, chocks and lashings for one tier — counted against the payload,
   * because the weighbridge counts them. */
  readonly ancillaryMassPerTier: Kilograms;
}

const DEFAULT_CLEARANCES: ClearanceOptions = Object.freeze({
  shaftToShaft: 25,
  helixToShaft: 25,
  helixToHelix: 25,
});

// Placeholders, tight on purpose — see `BalanceTolerance`.
const DEFAULT_BALANCE_TOLERANCE: BalanceTolerance = Object.freeze({
  longitudinal: 200,
  lateral: 50,
});

export const DEFAULT_LOADING_OPTIONS: LoadingOptions = Object.freeze({
  clearances: DEFAULT_CLEARANCES,
  balance: DEFAULT_BALANCE_TOLERANCE,
  dunnageThickness: 100,
  endGap: 100,
  sideMargin: 50,
  headboardGap: 100,
  maxTiers: 4,
  ancillaryMassPerTier: 60,
});

/** Height a tier of this pile type occupies, including its bearers. */
export function tierHeightFor(
  type: PileType,
  options: LoadingOptions,
): Millimetres {
  return options.dunnageThickness + maxRadius(type) * 2;
}

/** Tier indices present in a set of placements, bottom first. */
export function tiersOf(placements: readonly Placement[]): number[] {
  return [...new Set(placements.map(placement => placement.tier))].sort(
    (a, b) => a - b,
  );
}

/** Height of each tier, keyed by tier index. A tier is as tall as its widest pile. */
export function tierHeights(
  placements: readonly Placement[],
  catalogue: Catalogue,
  options: LoadingOptions,
): Map<number, Millimetres> {
  const heights = new Map<number, Millimetres>();
  for (const placement of placements) {
    const type = findPileType(catalogue, placement.pileTypeId);
    if (!type) {
      continue;
    }
    const height = tierHeightFor(type, options);
    heights.set(
      placement.tier,
      Math.max(heights.get(placement.tier) ?? 0, height),
    );
  }
  return heights;
}

/** Height of the deck surface of a given tier above the deck itself. */
function tierBaseHeight(
  tier: number,
  heights: ReadonlyMap<number, Millimetres>,
  options: LoadingOptions,
): Millimetres {
  let base = 0;
  for (const [index, height] of [...heights].sort((a, b) => a[0] - b[0])) {
    if (index >= tier) {
      break;
    }
    base += height;
  }
  return base + options.dunnageThickness;
}

/**
 * Height of a placed pile's axis above the deck. A pile rests on its widest
 * point, so piles of different diameter sit at different heights in one tier —
 * offset the lateral separation rule gets to spend.
 */
export function axisHeightOf(
  placed: PlacedPile,
  heights: ReadonlyMap<number, Millimetres>,
  options: LoadingOptions,
): Millimetres {
  return (
    tierBaseHeight(placed.placement.tier, heights, options) +
    maxRadius(placed.type)
  );
}

/** Total load height above the deck, bearers included. */
export function loadHeight(
  placements: readonly Placement[],
  catalogue: Catalogue,
  options: LoadingOptions,
): Millimetres {
  let total = 0;
  for (const height of tierHeights(placements, catalogue, options).values()) {
    total += height;
  }
  return total;
}

/** Mass of the bearers, chocks and lashings a load of this shape needs. */
export function ancillaryMass(
  placements: readonly Placement[],
  options: LoadingOptions,
): Kilograms {
  return tiersOf(placements).length * options.ancillaryMassPerTier;
}
