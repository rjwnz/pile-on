import {
  findPileType,
  type Catalogue,
  type Consignment,
  type LoadPlan,
} from '../domain/catalogue';
import type {Job} from '../domain/job';
import {maxRadius} from '../domain/pile';
import type {Placement} from '../domain/placement';
import {
  balanceTargetOf,
  payloadCapacity,
  type Vehicle,
} from '../domain/vehicle';
import {loadCentroid} from '../domain/balance';
import type {PlacedPile} from '../domain/placement';
import {requiredLateralSeparation} from '../geometry/separation';
import {NZ_VDAM_2016, type VdamRuleset} from '../rules/nzVdam';
import {coveredSpans} from '../validation/plan';
import type {Millimetres} from '../units';
import {groupBy} from '../collections';
import {shiftToBalance} from './balance';
import {unplaceableReason} from './feasibility';
import {withoutFlips, type PackingOptions} from './options';
import {packTier, type TierPlacement} from './tier';

/**
 * The helix-aware packer. Unlike `arrangeNaively` it knows a pile is not a
 * cylinder of its widest diameter: stagger neighbouring lanes so their plates
 * miss and they close from plate pitch to shaft pitch — a sixth lane on a deck
 * that fits five. The pieces live in `stagger.ts` (exact offsets), `lane.ts`
 * (fill patterns) and `tier.ts` (the sweep).
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

/** Distinct pile half-widths still wanted, widest first. */
function widthClasses(
  remaining: ReadonlyMap<string, number>,
  catalogue: Catalogue,
): Millimetres[] {
  const radii = new Set<Millimetres>();
  for (const [id, count] of remaining) {
    const type = count > 0 ? findPileType(catalogue, id) : undefined;
    if (type) {
      radii.add(maxRadius(type));
    }
  }
  return [...radii].sort((a, b) => b - a);
}

/** The tallest a tier of this half-width class comes out. */
function tierHeightForClass(
  halfWidth: Millimetres,
  options: PackingOptions,
): Millimetres {
  return options.dunnageThickness + halfWidth * 2;
}

interface TierChoice {
  readonly result: ReturnType<typeof packTier>;
  readonly height: Millimetres;
}

/**
 * Pack a job onto trucks of one type.
 *
 * With flipping allowed the job is packed twice, once each way, and the better
 * answer kept: the greedy sweep is not monotone in its candidate set, so on
 * some jobs the extra flip options steer it into a worse tier.
 */
export function pack(
  job: Job,
  catalogue: Catalogue,
  vehicle: Vehicle,
  options: PackingOptions,
  ruleset: VdamRuleset = NZ_VDAM_2016,
): PackResult {
  const flipped = packOnce(job, catalogue, vehicle, options, ruleset);
  if (!options.allowFlips) {
    return flipped;
  }
  const plain = packOnce(
    job,
    catalogue,
    vehicle,
    withoutFlips(options),
    ruleset,
  );
  return better(flipped, plain);
}

/** Fewer trucks wins; then more piles placed; then the flipped one, for stability. */
function better(flipped: PackResult, plain: PackResult): PackResult {
  const trucks = (result: PackResult) => result.plan.consignments.length;
  if (trucks(plain) !== trucks(flipped)) {
    return trucks(plain) < trucks(flipped) ? plain : flipped;
  }
  return plain.plan.placements.length > flipped.plan.placements.length
    ? plain
    : flipped;
}

function packOnce(
  job: Job,
  catalogue: Catalogue,
  vehicle: Vehicle,
  options: PackingOptions,
  ruleset: VdamRuleset,
): PackResult {
  const usable = {
    length: vehicle.deckLength + vehicle.maxRearOverhang - options.headboardGap,
    width: vehicle.deckWidth - options.sideMargin * 2,
  };
  const maxLoadHeight = ruleset.maxHeight - vehicle.deckHeight;
  const payload = payloadCapacity(vehicle);

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
    const reason = unplaceableReason(type, vehicle, options, ruleset, usable);
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
    const truckId = `C${consignments.length + 1}`;
    const onTruck: Placement[] = [];

    let heightUsed = 0;
    let massUsed = 0;
    let ceiling = Infinity;
    let support: readonly (readonly [Millimetres, Millimetres])[] | null = null;

    for (let tier = 0; tier < options.maxTiers; tier++) {
      const massBudget = payload - massUsed - options.ancillaryMassPerTier;
      if (massBudget <= 0) {
        break;
      }

      /*
       * Try each remaining diameter as the tier's ceiling and keep the densest
       * per millimetre of height. The ceiling never rises going up the stack,
       * and the bottom tier gets no vote — the widest thing still wanted sets
       * it, else no wide pile could ever board.
       */
      const classes = widthClasses(remaining, catalogue);
      const allowed = tier === 0 ? classes.slice(0, 1) : classes;

      let best: TierChoice | null = null;
      for (const halfWidth of allowed) {
        if (halfWidth > ceiling) {
          continue;
        }
        if (
          heightUsed + tierHeightForClass(halfWidth, options) >
          maxLoadHeight
        ) {
          continue;
        }
        const result = packTier({
          available: remaining,
          catalogue,
          vehicle,
          options,
          maxHalfWidth: halfWidth,
          massBudget,
          support,
        });
        if (result.placements.length === 0) {
          continue;
        }
        // Charged on what the tier actually holds, not on what it was allowed
        // to hold. A tier permitted 225 mm plates but filled with 175 mm ones
        // is a 175 mm tier, and scoring it as tall would hide the better answer.
        const height = tierHeightForClass(result.halfWidth, options);
        if (heightUsed + height > maxLoadHeight) {
          continue;
        }
        const density = result.placements.length / height;
        const bestDensity = best
          ? best.result.placements.length / best.height
          : -Infinity;
        if (
          density > bestDensity ||
          (density === bestDensity && height > (best?.height ?? 0))
        ) {
          best = {result, height};
        }
      }

      if (!best) {
        break;
      }

      for (const [index, placed] of best.result.placements.entries()) {
        onTruck.push({
          id: `${truckId}-T${tier}-${index}`,
          consignmentId: truckId,
          deck: 'truck',
          pileTypeId: placed.pileTypeId,
          tier,
          x: placed.x,
          y: placed.y,
          flipped: placed.flipped,
        });
      }

      consume(remaining, best.result.placements);
      massUsed += best.result.mass + options.ancillaryMassPerTier;
      heightUsed += best.height;
      ceiling = best.result.halfWidth;
      support = spansOf(best.result.placements, catalogue, options);
    }

    if (onTruck.length === 0) {
      // Nothing fits an empty truck, so nothing will fit the next one either.
      // Report what is left rather than opening trucks forever.
      for (const [id, count] of remaining) {
        if (count > 0) {
          unplaced.push({
            pileTypeId: id,
            quantity: count,
            reason:
              'no room left on a truck of this type once the rest is loaded',
          });
        }
      }
      break;
    }

    consignments.push({
      id: truckId,
      vehicleId: vehicle.id,
      trailerId: null,
      phase: null,
    });
    // Settling is an optimisation and is checked like one: verified, and
    // thrown away for the sweep's own (already supported) layout if it broke
    // support.
    const settled = settleTiers(
      mirrorTiers(onTruck, catalogue),
      catalogue,
      vehicle,
      options,
    );
    const kept = allTiersSupported(settled, catalogue, options)
      ? settled
      : onTruck;
    placements.push(
      ...nudgeLanes(
        shiftToBalance(kept, catalogue, vehicle),
        catalogue,
        vehicle,
        options,
      ),
    );
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

    ranges = intersect(ranges, [
      [
        -vehicle.maxFrontOverhang - start,
        vehicle.deckLength + vehicle.maxRearOverhang - end,
      ],
    ]);

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
    const shift = ranges.length
      ? ranges
          .map(([low, high]) => Math.min(Math.max(wanted, low), high))
          .reduce((best, option) =>
            Math.abs(option - wanted) < Math.abs(best - wanted) ? option : best,
          )
      : 0;

    const moved = inTier.map(placement => ({
      ...placement,
      x: placement.x + shift,
    }));
    settled.push(...moved);
    carriedMass += mass;
    carriedMoment += moment + mass * shift;
    support = spansOf(moved, catalogue, options);
  }

  return settled;
}

/**
 * Mirror tiers across the deck centreline until the truck sits level. The
 * sweep biases each tier's mass toward the side it builds from; flipping the
 * sign of y is free (distances and margins are symmetric), and each tier picks
 * the side that best undoes the bias of the tiers below it.
 */
function mirrorTiers(
  onTruck: readonly Placement[],
  catalogue: Catalogue,
): Placement[] {
  const byTier = groupBy(onTruck, placement => placement.tier);

  const out: Placement[] = [];
  let moment = 0;
  for (const [, inTier] of [...byTier].sort((a, b) => a[0] - b[0])) {
    let tierMoment = 0;
    for (const placement of inTier) {
      const type = findPileType(catalogue, placement.pileTypeId);
      if (type) {
        tierMoment += type.mass * placement.y;
      }
    }
    const mirror =
      Math.abs(moment - tierMoment) < Math.abs(moment + tierMoment) ? -1 : 1;
    moment += tierMoment * mirror;
    out.push(
      ...inTier.map(placement => ({...placement, y: placement.y * mirror})),
    );
  }
  return out;
}

/**
 * Move single lanes, once moving whole tiers has run out of road. Unlike a
 * tier shift this can undo a stagger, so each nudge is applied, checked, and
 * rolled back if it broke anything. Last resort; only runs when the load is
 * genuinely out of tolerance.
 */
function nudgeLanes(
  onTruck: readonly Placement[],
  catalogue: Catalogue,
  vehicle: Vehicle,
  options: PackingOptions,
): Placement[] {
  const target = balanceTargetOf(vehicle);
  let current = [...onTruck];

  const offsetOf = (load: readonly Placement[]) => {
    const centroid = loadCentroid(load, catalogue);
    return centroid ? centroid.x - target : 0;
  };

  const lanesOf = (load: readonly Placement[]) => {
    const keys = new Set(load.map(p => `${p.tier}:${p.y}`));
    return [...keys];
  };

  for (let round = 0; round < 12; round++) {
    const offset = offsetOf(current);
    if (Math.abs(offset) <= options.balance.longitudinal) {
      break;
    }

    let improved = false;
    for (const lane of lanesOf(current)) {
      const inLane = current.filter(p => `${p.tier}:${p.y}` === lane);
      const laneMass = inLane.reduce((total, placement) => {
        const type = findPileType(catalogue, placement.pileTypeId);
        return type ? total + type.mass : total;
      }, 0);
      const total = loadCentroid(current, catalogue)?.mass ?? 0;
      if (laneMass <= 0 || total <= 0) {
        continue;
      }

      // Moving this lane by d moves the whole load by d × its share of the mass.
      const wanted = (-offset * total) / laneMass;
      const [low, high] = laneTravel(inLane, catalogue, vehicle);
      const shift = Math.min(Math.max(wanted, low), Math.max(low, high));
      if (Math.abs(shift) < 1) {
        continue;
      }

      const moved = current.map(placement =>
        `${placement.tier}:${placement.y}` === lane
          ? {...placement, x: placement.x + shift}
          : placement,
      );
      if (
        Math.abs(offsetOf(moved)) < Math.abs(offset) &&
        laneStillClears(moved, lane, catalogue, options) &&
        allTiersSupported(moved, catalogue, options)
      ) {
        current = moved;
        improved = true;
        break;
      }
    }
    if (!improved) {
      break;
    }
  }

  return current;
}

/** How far one lane may slide before it leaves the vehicle. */
function laneTravel(
  inLane: readonly Placement[],
  catalogue: Catalogue,
  vehicle: Vehicle,
): [Millimetres, Millimetres] {
  let low = -Infinity;
  let high = Infinity;
  for (const placement of inLane) {
    const type = findPileType(catalogue, placement.pileTypeId);
    if (!type) {
      continue;
    }
    low = Math.max(low, -vehicle.maxFrontOverhang - placement.x);
    high = Math.min(
      high,
      vehicle.deckLength +
        vehicle.maxRearOverhang -
        (placement.x + type.length),
    );
  }
  return [low, high];
}

/** Whether a moved lane is still clear of everything else in its tier. */
function laneStillClears(
  load: readonly Placement[],
  lane: string,
  catalogue: Catalogue,
  options: PackingOptions,
): boolean {
  const resolve = (placement: Placement): PlacedPile | null => {
    const type = findPileType(catalogue, placement.pileTypeId);
    return type ? {type, placement} : null;
  };

  const moved = load
    .filter(p => `${p.tier}:${p.y}` === lane)
    .map(resolve)
    .filter(placed => placed !== null);
  const tier = moved[0]?.placement.tier;
  const others = load
    .filter(p => p.tier === tier && `${p.tier}:${p.y}` !== lane)
    .map(resolve)
    .filter(placed => placed !== null);

  for (const mine of moved) {
    for (const other of others) {
      const deltaZ = maxRadius(mine.type) - maxRadius(other.type);
      const required = requiredLateralSeparation(mine, other, options, deltaZ);
      const actual = Math.abs(mine.placement.y - other.placement.y);
      if (actual + 1e-6 < required) {
        return false;
      }
    }
  }
  return true;
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

function consume(
  remaining: Map<string, number>,
  placed: readonly TierPlacement[],
): void {
  for (const placement of placed) {
    remaining.set(
      placement.pileTypeId,
      (remaining.get(placement.pileTypeId) ?? 0) - 1,
    );
  }
}

/**
 * Where a tier has material, along the deck. Uses the validator's own
 * `coveredSpans` so the packer cannot build tiers the support rule rejects.
 */
function spansOf(
  placed: readonly (TierPlacement | Placement)[],
  catalogue: Catalogue,
  options: PackingOptions,
): [Millimetres, Millimetres][] {
  const intervals = placed.flatMap<[Millimetres, Millimetres]>(placement => {
    const type = findPileType(catalogue, placement.pileTypeId);
    return type ? [[placement.x, placement.x + type.length]] : [];
  });
  return coveredSpans(intervals, options.endGap + options.dunnageThickness);
}
