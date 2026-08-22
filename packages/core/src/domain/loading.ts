import type {Kilograms, Millimetres} from '../units';
import {maxRadius, type PileType} from './pile';
import type {PlacedPile, Placement} from './placement';
import type {Catalogue} from './catalogue';
import {findPileType} from './catalogue';

/**
 * Minimum steel-to-steel gaps, by which two surfaces are meeting.
 *
 * One number used to cover all three cases. It does not, because the cases are
 * physically different: two shafts touching is a hard clash, a plate passing a
 * shaft is the one staggering is meant to exploit, and two plates at the same
 * station is what a double-helix pile can never avoid. The yard sets them
 * independently.
 *
 * Equal values reproduce the single-clearance behaviour exactly.
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
 * How far the load centroid may sit from where the deck wants it.
 *
 * Balance is not legally specified. It stands in for axle-set limits, the 20%
 * front-axle rule and the static roll threshold — all of which need the
 * deck-origin-to-axle mapping this model deliberately does not carry. So no
 * tolerance here can be *derived* to guarantee legality, and the defaults err
 * tight on purpose: too tight rejects a legal load visibly, too loose accepts an
 * illegal one silently. See docs/01-packer-design.md §4.6.
 */
export interface BalanceTolerance {
  /** Along the deck, from the vehicle's balance target. */
  readonly longitudinal: Millimetres;
  /** Across the deck, from the centreline. */
  readonly lateral: Millimetres;
}

/**
 * How this yard loads a truck, and what makes a load legal.
 *
 * Shared by the arranger, the packer and the validator, so that what gets built
 * and what gets checked cannot drift apart. Everything here bears on whether a
 * plan is *valid*; options that only shape what the search is allowed to try
 * live in `PackingOptions` instead.
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
  /**
   * Bearers, chocks and lashings for one tier.
   *
   * Small against a 28 t payload, but it is the difference between under the
   * limit on paper and under the limit at the weighbridge, so the packer
   * reserves it and the validator counts it.
   */
  readonly ancillaryMassPerTier: Kilograms;
}

export const DEFAULT_CLEARANCES: ClearanceOptions = Object.freeze({
  shaftToShaft: 25,
  helixToShaft: 25,
  helixToHelix: 25,
});

/**
 * Placeholders, and tight on purpose — see `BalanceTolerance`.
 *
 * 200 mm longitudinal is about five times the finest adjustment a single pile
 * can make on a full deck, so it is reliably reachable, and it stays inside the
 * range where the rule can still fire even on a short rigid deck. 50 mm lateral
 * costs almost nothing, because lanes are generated symmetric about the
 * centreline and a load lands near-balanced by construction.
 */
export const DEFAULT_BALANCE_TOLERANCE: BalanceTolerance = Object.freeze({
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

/**
 * Height of a placed pile's axis above the deck.
 *
 * A pile rests on its widest point — for a helical pile that is the plates, not
 * the shaft — so its axis sits one widest-radius above the bearers. Two piles of
 * different diameter therefore sit at *different* heights in the same tier, and
 * that vertical offset is real clearance the lateral separation rule can spend.
 *
 * This lived in the renderer, where it could quietly disagree with the packer
 * and the validator about where steel actually is. It is geometry, so it lives
 * here and everything reads it from one place.
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
