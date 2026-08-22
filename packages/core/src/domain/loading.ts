import type {Millimetres} from '../units';
import {maxRadius, type PileType} from './pile';
import type {Placement} from './placement';
import type {Catalogue} from './catalogue';
import {findPileType} from './catalogue';

/**
 * How this yard loads a truck. Shared by the arranger and the validator, so
 * that what gets built and what gets checked cannot drift apart.
 */
export interface LoadingOptions {
  /** Minimum steel-to-steel gap between neighbouring piles. */
  readonly clearance: Millimetres;
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
}

export const DEFAULT_LOADING_OPTIONS: LoadingOptions = Object.freeze({
  clearance: 25,
  dunnageThickness: 100,
  endGap: 100,
  sideMargin: 50,
  headboardGap: 100,
  maxTiers: 4,
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

/**
 * Height of each tier, keyed by tier index.
 *
 * A tier is as tall as its widest pile — mixing diameters in one tier wastes
 * the difference, which is exactly the sort of thing the view should make
 * visible.
 */
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
export function tierBaseHeight(
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
