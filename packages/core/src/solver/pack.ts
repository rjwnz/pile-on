import {
  combinationDeckArea,
  combinationsOf,
  findPileType,
  findVehicle,
  type Catalogue,
  type Consignment,
  type LoadPlan,
  type VehicleCombination,
} from '../domain/catalogue';
import type {Job} from '../domain/job';
import {MAX_LOAD_HEIGHT, loadHeight} from '../domain/loading';
import {
  everyPackIsBorne,
  footprintOver,
  layerHeights,
  layersOf,
  packLateralSpan,
  packLongitudinalSpan,
} from '../domain/packs';
import {loadCentroid} from '../domain/balance';
import {maxRadius} from '../domain/pile';
import type {DeckRole, Placement} from '../domain/placement';
import {
  balanceTargetOf,
  deckArea,
  payloadCapacity,
  type Vehicle,
} from '../domain/vehicle';
import {coveredSpans} from '../validation/plan';
import {GEOMETRIC_EPSILON, type Kilograms, type Millimetres} from '../units';
import {groupBy} from '../collections';
import {shiftToBalance} from './balance';
import {unplaceableOnFleet} from './feasibility';
import {packTier} from './layer';
import {withoutFlips, type PackingOptions} from './options';

/**
 * The helix-aware packer. Unlike `arrangeNaively` it knows a pile is not a
 * cylinder of its widest diameter: stagger neighbouring piles so their plates
 * miss and a pack closes from plate pitch to shaft pitch — an extra lane in a
 * pack that fits two. The pieces live in `stagger.ts` (exact offsets),
 * `lane.ts` (fill patterns), `packBuilder.ts` (the within-pack sweep) and
 * `layer.ts` (pairing packs into tiers).
 */

export interface PackedType {
  readonly pileTypeId: string;
  readonly quantity: number;
  readonly reason: string;
}

export interface PackResult {
  readonly plan: LoadPlan;
  /** Demand that could not be placed anywhere, with why. */
  readonly unplaced: readonly PackedType[];
}

/**
 * Pack a job onto the fleet: every truck in the catalogue, each optionally
 * towing one of the trailers that lists it. The objective is fewest movements
 * — a truck and its trailer travel as one — with ties broken by least deck
 * area committed.
 *
 * With flipping allowed the job is packed twice, once each way, and the better
 * answer kept: the greedy sweep is not monotone in its candidate set, so on
 * some jobs the extra flip options steer it into a worse tier.
 */
export function pack(
  job: Job,
  catalogue: Catalogue,
  options: PackingOptions,
): PackResult {
  const flipped = packFleetOnce(job, catalogue, options);
  if (!options.allowFlips) {
    return flipped;
  }
  const plain = packFleetOnce(job, catalogue, withoutFlips(options));
  return better(flipped, plain, catalogue);
}

/**
 * Fewer movements wins; then more piles placed; then less deck area
 * committed; then the flipped one, for stability.
 */
function better(
  flipped: PackResult,
  plain: PackResult,
  catalogue: Catalogue,
): PackResult {
  const movements = (result: PackResult) => result.plan.consignments.length;
  if (movements(plain) !== movements(flipped)) {
    return movements(plain) < movements(flipped) ? plain : flipped;
  }
  if (plain.plan.placements.length !== flipped.plan.placements.length) {
    return plain.plan.placements.length > flipped.plan.placements.length
      ? plain
      : flipped;
  }
  const area = (result: PackResult) =>
    result.plan.consignments.reduce((total, consignment) => {
      const truck = findVehicle(catalogue, consignment.vehicleId);
      const trailer = consignment.trailerId
        ? findVehicle(catalogue, consignment.trailerId)
        : undefined;
      return (
        total +
        (truck ? deckArea(truck) : 0) +
        (trailer ? deckArea(trailer) : 0)
      );
    }, 0);
  return area(plain) < area(flipped) ? plain : flipped;
}

/** What one deck came out carrying, before it knows which movement it is in. */
interface DeckLoad {
  /**
   * Deck-local placements: x from this deck's headboard, scratch ids of the
   * form `T{tier}-{index}` for the caller to qualify, `consignmentId` and
   * `deck` left for the caller to stamp.
   */
  readonly placements: readonly Placement[];
  /** Piles plus per-tier ancillary mass — what the deck adds to the gross. */
  readonly mass: Kilograms;
  /** Demand this load would consume, by pile type. */
  readonly consumed: ReadonlyMap<string, number>;
}

const EMPTY_DECK: DeckLoad = {placements: [], mass: 0, consumed: new Map()};

/**
 * Fill one deck from the demand: the layer loop, then the balance pipeline —
 * mirror (verified against the pack footprints), settle (verified, with
 * fallback), shift, then the rigid slide onto the centreline — all against
 * this deck's own row. Does not mutate `remaining`; the caller commits
 * `consumed` if it keeps the load.
 */
function packOneDeck(
  remaining: ReadonlyMap<string, number>,
  catalogue: Catalogue,
  vehicle: Vehicle,
  options: PackingOptions,
): DeckLoad {
  const payload = payloadCapacity(vehicle);

  const available = new Map(remaining);
  const consumed = new Map<string, number>();
  const onDeck: Placement[] = [];

  let massUsed = 0;
  let support: readonly (readonly [Millimetres, Millimetres])[] | null = null;
  let below: readonly Placement[] | null = null;

  for (let tier = 0; tier < options.maxTiers; tier++) {
    const massBudget = payload - massUsed - options.ancillaryMassPerTier;
    if (massBudget <= 0) {
      break;
    }

    /*
     * The bearers under this tier depend on the tier itself (its plates, and
     * how they stagger against everything below), so the exact height is only
     * known after packing. Candidates are screened against the headroom above
     * the shafts stacked so far, and the finished tier is verified against
     * the true derived height — popped again if the bearers came out too
     * thick to fit.
     */
    const stacked = [...layerHeights(onDeck, catalogue, options).values()];
    const shaftTopSoFar = stacked[stacked.length - 1]?.shaftTop ?? 0;
    const headroom = MAX_LOAD_HEIGHT - shaftTopSoFar;
    if (headroom <= 0) {
      break;
    }

    const layer = packTier({
      available,
      catalogue,
      vehicle,
      options,
      headroom,
      massBudget,
      support,
      below,
    });
    if (layer.placements.length === 0) {
      break;
    }

    const inTier: Placement[] = layer.placements.map((pile, index) => ({
      ...pile.placement,
      id: `T${tier}-${index}`,
      tier,
    }));
    onDeck.push(...inTier);
    if (loadHeight(onDeck, catalogue, options) > MAX_LOAD_HEIGHT) {
      onDeck.splice(onDeck.length - inTier.length);
      break;
    }

    for (const pile of layer.placements) {
      const id = pile.placement.pileTypeId;
      available.set(id, (available.get(id) ?? 0) - 1);
      consumed.set(id, (consumed.get(id) ?? 0) + 1);
    }
    massUsed += layer.mass + options.ancillaryMassPerTier;
    support = spansOf(inTier, catalogue, options);
    below = inTier;
  }

  if (onDeck.length === 0) {
    return EMPTY_DECK;
  }

  // Mirroring changes cross-tier lateral distances, and settling changes
  // longitudinal overlaps — both can thicken the derived bearers, and sliding
  // a row can walk a pack off the ground its timbers need. Each is an
  // optimisation and is checked like one: verified, and thrown away for the
  // already-legal layout when it broke support, left a pack unbearable, or
  // pushed the stack over height.
  const mirrored = mirrorTiers(onDeck, catalogue, options);
  const upright =
    loadHeight(mirrored, catalogue, options) <= MAX_LOAD_HEIGHT
      ? mirrored
      : onDeck;

  const settled = settleTiers(upright, catalogue, vehicle, options);
  const kept =
    allTiersSupported(settled, catalogue, options) &&
    allTiersContained(settled, catalogue, options) &&
    everyPackIsBorne(settled, catalogue, options) &&
    loadHeight(settled, catalogue, options) <= MAX_LOAD_HEIGHT
      ? settled
      : upright;
  return {
    placements: centreLaterally(
      shiftToBalance(kept, catalogue, vehicle),
      catalogue,
      vehicle,
      options,
    ),
    mass: massUsed,
    consumed,
  };
}

/**
 * Slide the whole load sideways onto the centreline, rigid. Every tier moves
 * by the same amount, so separations, footprints and support all ride along
 * untouched — the one lateral repair that is safe by construction, and the
 * only one that reaches a pack pinned off-centre by the footprint below it.
 */
function centreLaterally(
  onTruck: readonly Placement[],
  catalogue: Catalogue,
  vehicle: Vehicle,
  options: PackingOptions,
): Placement[] {
  const centroid = loadCentroid(onTruck, catalogue);
  if (!centroid) {
    return [...onTruck];
  }
  let left = Infinity;
  let right = -Infinity;
  for (const placement of onTruck) {
    const type = findPileType(catalogue, placement.pileTypeId);
    if (!type) {
      continue;
    }
    left = Math.min(left, placement.y - maxRadius(type));
    right = Math.max(right, placement.y + maxRadius(type));
  }
  if (left > right) {
    return [...onTruck];
  }
  const halfDeck = vehicle.deckWidth / 2 - options.sideMargin;
  const shift = Math.min(
    Math.max(-centroid.y, -halfDeck - left),
    halfDeck - right,
  );
  if (Math.abs(shift) <= GEOMETRIC_EPSILON) {
    return [...onTruck];
  }
  return onTruck.map(placement => ({
    ...placement,
    y: placement.y + shift,
  }));
}

/** `tierContained`, over every adjacent pair of tiers on the deck. */
function allTiersContained(
  onTruck: readonly Placement[],
  catalogue: Catalogue,
  options: PackingOptions,
): boolean {
  const tiers = [...layersOf(onTruck).values()];
  for (let index = 1; index < tiers.length; index++) {
    const inTier = [...tiers[index]!.values()].flat();
    const below = [...tiers[index - 1]!.values()].flat();
    if (!tierContained(inTier, below, catalogue, options)) {
      return false;
    }
  }
  return true;
}

/**
 * Whether every pack in a tier stands wholly on the footprint the tier
 * below offers over the pack's own run of deck — the containment the row
 * sweep worked to, re-checked whenever an optimisation moves things.
 */
function tierContained(
  inTier: readonly Placement[],
  below: readonly Placement[],
  catalogue: Catalogue,
  options: PackingOptions,
): boolean {
  for (const packs of layersOf(inTier).values()) {
    for (const pack of packs.values()) {
      const span = packLateralSpan(pack, catalogue);
      const xSpan = packLongitudinalSpan(pack, catalogue);
      if (!span || !xSpan) {
        continue;
      }
      const footprint = footprintOver(
        below,
        catalogue,
        options,
        xSpan[0],
        xSpan[1],
      );
      if (footprint === null) {
        continue;
      }
      const held = footprint.some(
        ([from, to]) =>
          span[0] >= from - GEOMETRIC_EPSILON &&
          span[1] <= to + GEOMETRIC_EPSILON,
      );
      if (!held) {
        return false;
      }
    }
  }
  return true;
}

/** One candidate movement, packed but not committed. */
interface MovementLoad {
  readonly combo: VehicleCombination;
  readonly truck: DeckLoad;
  readonly trailer: DeckLoad | null;
  readonly placed: number;
  readonly area: number;
}

/**
 * Pack one candidate movement against the remaining demand.
 *
 * Each deck fills to its own stated payload capacity — there is no combined
 * gross cap to share out, so a deck is bounded only by what it can carry.
 * The longer deck packs first so the long piles land where they fit, but the
 * loads keep their roles — a pile packed on the trailer's row is a trailer
 * placement whichever deck went first.
 */
function packMovement(
  combo: VehicleCombination,
  remaining: ReadonlyMap<string, number>,
  catalogue: Catalogue,
  options: PackingOptions,
): MovementLoad {
  const reach = (vehicle: Vehicle) => vehicle.deckLength;
  const decks: {role: DeckRole; vehicle: Vehicle}[] = combo.trailer
    ? [
        {role: 'truck' as const, vehicle: combo.truck},
        {role: 'trailer' as const, vehicle: combo.trailer},
      ].sort((a, b) => reach(b.vehicle) - reach(a.vehicle))
    : [{role: 'truck', vehicle: combo.truck}];

  const available = new Map(remaining);
  const loads: Partial<Record<DeckRole, DeckLoad>> = {};
  for (const {role, vehicle} of decks) {
    const load = packOneDeck(available, catalogue, vehicle, options);
    loads[role] = load;
    for (const [id, count] of load.consumed) {
      available.set(id, (available.get(id) ?? 0) - count);
    }
  }

  const truck = loads.truck ?? EMPTY_DECK;
  const trailer = combo.trailer ? (loads.trailer ?? EMPTY_DECK) : null;
  return {
    combo,
    truck,
    trailer,
    placed: truck.placements.length + (trailer?.placements.length ?? 0),
    area: combinationDeckArea(combo),
  };
}

/**
 * The greedy fewest-movements loop: every iteration packs every combination
 * the catalogue can field against what is still to move, and commits the one
 * that places the most piles — the classic set-cover greedy. Ties fall to the
 * least deck area, so a truck alone beats towing a trailer that buys nothing,
 * and then to catalogue order, for determinism.
 */
function packFleetOnce(
  job: Job,
  catalogue: Catalogue,
  options: PackingOptions,
): PackResult {
  const combos = combinationsOf(catalogue);
  const usableOf = (vehicle: Vehicle) => ({
    length: vehicle.deckLength - options.headboardGap,
    width: vehicle.deckWidth - options.sideMargin * 2,
  });

  const remaining = new Map<string, number>();
  const unplaced: PackedType[] = [];

  for (const line of job.lines) {
    if (line.quantity <= 0) {
      continue;
    }
    const type = findPileType(catalogue, line.pileTypeId);
    if (!type) {
      // findDanglingReferences is what reports this; the packer just cannot act.
      continue;
    }
    const reason = unplaceableOnFleet(type, combos, options, usableOf);
    if (reason) {
      unplaced.push({pileTypeId: type.id, quantity: line.quantity, reason});
      continue;
    }
    remaining.set(line.pileTypeId, line.quantity);
  }

  const consignments: Consignment[] = [];
  const placements: Placement[] = [];

  const outstanding = () =>
    [...remaining.values()].reduce((total, count) => total + count, 0);

  while (outstanding() > 0) {
    let best: MovementLoad | null = null;
    for (const combo of combos) {
      const candidate = packMovement(combo, remaining, catalogue, options);
      if (
        !best ||
        candidate.placed > best.placed ||
        (candidate.placed === best.placed && candidate.area < best.area)
      ) {
        best = candidate;
      }
    }

    if (!best || best.placed === 0) {
      // Nothing fits an empty movement, so nothing will fit the next one
      // either. Report what is left rather than opening trucks forever.
      for (const [id, count] of remaining) {
        if (count > 0) {
          unplaced.push({
            pileTypeId: id,
            quantity: count,
            reason:
              'no room on any combination in the fleet once the rest is loaded',
          });
        }
      }
      break;
    }

    const truckId = `C${consignments.length + 1}`;
    consignments.push({
      id: truckId,
      vehicleId: best.combo.truck.id,
      trailerId: best.combo.trailer?.id ?? null,
      phase: null,
    });
    const commit = (load: DeckLoad, deck: DeckRole) => {
      placements.push(
        ...load.placements.map(placement => ({
          ...placement,
          id: `${truckId}-${deck}-${placement.id}`,
          consignmentId: truckId,
          deck,
        })),
      );
      for (const [id, count] of load.consumed) {
        remaining.set(id, (remaining.get(id) ?? 0) - count);
      }
    };
    commit(best.truck, 'truck');
    if (best.trailer) {
      commit(best.trailer, 'trailer');
    }
  }

  return {plan: {consignments, placements}, unplaced};
}

/** Pairwise intersection of two lists of closed intervals, empties dropped. */
function intersect(
  a: readonly (readonly [number, number])[],
  b: readonly (readonly [number, number])[],
): [number, number][] {
  const out: [number, number][] = [];
  for (const [aLow, aHigh] of a) {
    for (const [bLow, bHigh] of b) {
      const low = Math.max(aLow, bLow);
      const high = Math.min(aHigh, bHigh);
      if (low <= high) {
        out.push([low, high]);
      }
    }
  }
  return out;
}

/**
 * How far a whole tier may slide along the deck: every pile must stay on the
 * vehicle and, above the bottom tier, inside a stretch the tier below covers.
 * A set of intervals rather than a single clamp, because a short pile could
 * sit in either of two stretches.
 */
function shiftRange(
  inTier: readonly Placement[],
  catalogue: Catalogue,
  vehicle: Vehicle,
  support: readonly (readonly [Millimetres, Millimetres])[] | null,
): [number, number][] {
  let ranges: [number, number][] = [[-Infinity, Infinity]];

  for (const placement of inTier) {
    const type = findPileType(catalogue, placement.pileTypeId);
    if (!type) {
      continue;
    }
    const start = placement.x;
    const end = start + type.length;

    ranges = intersect(ranges, [[-start, vehicle.deckLength - end]]);

    if (support) {
      ranges = intersect(
        ranges,
        support
          .filter(([from, to]) => to - from >= type.length)
          .map(([from, to]): [number, number] => [from - start, to - end]),
      );
    }
    if (ranges.length === 0) {
      return [];
    }
  }

  return ranges;
}

/**
 * Slide each tier along the deck to bring the truck onto its balance point.
 * Tiers move whole (so nothing inside them is disturbed), settle bottom up
 * (moving one moves the ground of the next), and each aims at what the truck
 * needs *so far* — a hemmed-in tier's shortfall is then made up by the ones
 * above it.
 */
function settleTiers(
  onTruck: readonly Placement[],
  catalogue: Catalogue,
  vehicle: Vehicle,
  options: PackingOptions,
): Placement[] {
  const byTier = groupBy(onTruck, placement => placement.tier);

  const target = balanceTargetOf(vehicle);
  const settled: Placement[] = [];
  let support: readonly (readonly [Millimetres, Millimetres])[] | null = null;
  let below: readonly Placement[] | null = null;
  let carriedMass = 0;
  let carriedMoment = 0;

  for (const [, inTier] of [...byTier].sort((a, b) => a[0] - b[0])) {
    let moment = 0;
    let mass = 0;
    for (const placement of inTier) {
      const type = findPileType(catalogue, placement.pileTypeId);
      if (type) {
        moment += type.mass * (placement.x + type.length / 2);
        mass += type.mass;
      }
    }

    // What this tier has to move by for everything loaded so far to average
    // out on the balance point.
    const wanted =
      mass > 0
        ? (target * (carriedMass + mass) - carriedMoment - moment) / mass
        : 0;

    const ranges = shiftRange(inTier, catalogue, vehicle, support);
    const bySize = ranges
      .map(([low, high]) => Math.min(Math.max(wanted, low), high))
      .sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted));

    // The support ranges know nothing of the pack footprints, so each slide
    // is verified where it lands: the best option that keeps this tier on
    // the packs already settled beneath it, falling back to not moving at
    // all — which can itself be off the footprint if the tier below moved,
    // and the caller's whole-result verification catches that case.
    let shift = 0;
    let moved: Placement[] = [...inTier];
    for (const option of bySize) {
      const candidate = inTier.map(placement => ({
        ...placement,
        x: placement.x + option,
      }));
      if (!below || tierContained(candidate, below, catalogue, options)) {
        shift = option;
        moved = candidate;
        break;
      }
    }

    settled.push(...moved);
    carriedMass += mass;
    carriedMoment += moment + mass * shift;
    support = spansOf(moved, catalogue, options);
    below = moved;
  }

  return settled;
}

/**
 * Mirror tiers across the deck centreline until the truck sits level. The
 * layer builder biases each tier's mass toward wherever its packs came out
 * heavier; flipping the sign of y is free (distances and margins are
 * symmetric), and each tier picks the side that best undoes the bias of the
 * tiers below it. Flipping one tier and not the next can pull a pack off
 * the footprint below it, so each tier only takes the side that keeps it
 * contained on the tier as already decided — and when neither side does,
 * the deck goes back exactly as built, which is contained by construction.
 */
function mirrorTiers(
  onTruck: readonly Placement[],
  catalogue: Catalogue,
  options: PackingOptions,
): Placement[] {
  const byTier = groupBy(onTruck, placement => placement.tier);

  const out: Placement[] = [];
  let moment = 0;
  let below: readonly Placement[] | null = null;
  for (const [, inTier] of [...byTier].sort((a, b) => a[0] - b[0])) {
    let tierMoment = 0;
    for (const placement of inTier) {
      const type = findPileType(catalogue, placement.pileTypeId);
      if (type) {
        tierMoment += type.mass * placement.y;
      }
    }
    const flipFirst =
      Math.abs(moment - tierMoment) < Math.abs(moment + tierMoment);

    let chosen: Placement[] | null = null;
    let mirror = 1;
    for (const sign of flipFirst ? [-1, 1] : [1, -1]) {
      const candidate =
        sign === -1
          ? inTier.map(placement => ({...placement, y: -placement.y}))
          : [...inTier];
      if (!below || tierContained(candidate, below, catalogue, options)) {
        chosen = candidate;
        mirror = sign;
        break;
      }
    }
    if (!chosen) {
      return [...onTruck];
    }

    moment += tierMoment * mirror;
    out.push(...chosen);
    below = chosen;
  }
  return out;
}

/** Whether every tier still lands on material in the tier below it. */
function allTiersSupported(
  onTruck: readonly Placement[],
  catalogue: Catalogue,
  options: PackingOptions,
): boolean {
  const byTier = groupBy(onTruck, placement => placement.tier);

  const tiers = [...byTier].sort((a, b) => a[0] - b[0]);
  for (const [index, [, inTier]] of tiers.entries()) {
    if (index === 0) {
      continue;
    }
    const support = spansOf(tiers[index - 1]![1], catalogue, options);
    const fits = inTier.every(placement => {
      const type = findPileType(catalogue, placement.pileTypeId);
      if (!type) {
        return true;
      }
      return support.some(
        ([from, to]) =>
          placement.x >= from - 1e-6 && placement.x + type.length <= to + 1e-6,
      );
    });
    if (!fits) {
      return false;
    }
  }
  return true;
}

/**
 * Where a tier has material, along the deck. Uses the validator's own
 * `coveredSpans` so the packer cannot build tiers the support rule rejects.
 */
function spansOf(
  placed: readonly Placement[],
  catalogue: Catalogue,
  options: PackingOptions,
): [Millimetres, Millimetres][] {
  const intervals = placed.flatMap<[Millimetres, Millimetres]>(placement => {
    const type = findPileType(catalogue, placement.pileTypeId);
    return type ? [[placement.x, placement.x + type.length]] : [];
  });
  return coveredSpans(intervals, options.endGap + options.dunnageThickness);
}
