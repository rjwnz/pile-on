import type {Kilograms, Millimetres} from '../units';
import {maxRadius, type PileType} from './pile';
import type {PlacedPile, Placement} from './placement';
import {findPileType, type Catalogue} from './catalogue';
import {
  dunnageForProtrusion,
  layerHeights,
  shaftProtrusion,
  type LayerHeight,
} from './packs';

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
  /** Thinnest bearer the yard stocks — 100 × 100 per the Truck Loading Code.
   * A tier needing more to clear the plates below gets a thicker bearer, in
   * `DUNNAGE_INCREMENT` steps. */
  readonly dunnageThickness: Millimetres;
  /**
   * Two packs sharing a tier must weigh alike, or the load is lopsided: the
   * lighter pack's mass must be at least this fraction of the heavier's.
   * Zero disables the rule. A tier carrying a single pack is judged by the
   * lateral balance tolerance instead.
   */
  readonly minPackMassRatio: number;
  /** Gap between rows of packs queued end to end along the deck. Piles never
   * lie end to end inside a pack, so this is a between-packs figure. */
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
  minPackMassRatio: 0.7,
  endGap: 100,
  sideMargin: 50,
  headboardGap: 100,
  maxTiers: 4,
  ancillaryMassPerTier: 60,
});

/**
 * The most load any deck in the fleet may carry above its own surface. Every
 * truck and trailer here tops out at the same 3 m — set by the stanchions, not
 * by the 4.3 m road limit — so it is one figure, not a per-vehicle input.
 */
export const MAX_LOAD_HEIGHT: Millimetres = 3000;

/**
 * The least height a tier of this pile type can occupy: bearers thick enough
 * that its own plates clear the deck, plus the climb from bearer top to the
 * top of the steel. Exact for a single tier on the deck; a lower bound in a
 * stack, where the bearers may come out thicker still. The conservative
 * figure feasibility and the baseline plan against.
 */
export function tierHeightFor(
  type: PileType,
  options: LoadingOptions,
): Millimetres {
  return (
    dunnageForProtrusion(shaftProtrusion(type), options) +
    type.shaftRadius +
    maxRadius(type)
  );
}

/** Tier indices present in a set of placements, bottom first. */
export function tiersOf(placements: readonly Placement[]): number[] {
  return [...new Set(placements.map(placement => placement.tier))].sort(
    (a, b) => a - b,
  );
}

/**
 * Height of a placed pile's axis above the deck. A pile seats its shaft on
 * the bearers, so piles of different shaft diameter sit at different heights
 * in one tier — offset the lateral separation rule gets to spend. `heights`
 * is the `layerHeights` of the whole deck, which carries each tier's derived
 * bearers.
 */
export function axisHeightOf(
  placed: PlacedPile,
  heights: ReadonlyMap<number, LayerHeight>,
): Millimetres {
  const layer = heights.get(placed.placement.tier);
  return (layer?.base ?? 0) + placed.type.shaftRadius;
}

/**
 * Total load height above the deck: the highest steel anywhere. Usually a
 * top-tier plate, but a tall plate lower down can out-reach the whole tier
 * above it, so this is a maximum over piles rather than a sum over tiers.
 */
export function loadHeight(
  placements: readonly Placement[],
  catalogue: Catalogue,
  options: LoadingOptions,
): Millimetres {
  const heights = layerHeights(placements, catalogue, options);
  let top = 0;
  for (const placement of placements) {
    const type = findPileType(catalogue, placement.pileTypeId);
    if (!type) {
      continue;
    }
    top = Math.max(
      top,
      axisHeightOf({type, placement}, heights) + maxRadius(type),
    );
  }
  return top;
}

/** Mass of the bearers, chocks and lashings a load of this shape needs. */
export function ancillaryMass(
  placements: readonly Placement[],
  options: LoadingOptions,
): Kilograms {
  return tiersOf(placements).length * options.ancillaryMassPerTier;
}
