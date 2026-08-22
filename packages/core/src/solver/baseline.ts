import {findPileType, type Catalogue, type LoadPlan} from '../domain/catalogue';
import {tierHeightFor, type LoadingOptions} from '../domain/loading';
import type {Job, JobLine} from '../domain/job';
import {maxRadius, type PileType} from '../domain/pile';
import type {Placement} from '../domain/placement';
import {payloadCapacity, type Vehicle} from '../domain/vehicle';
import {NZ_VDAM_2016, type VdamRuleset} from '../rules/nzVdam';
import type {Millimetres} from '../units';

/**
 * The naive bounding-box arranger — the *control*, not the packer.
 *
 * It treats every pile as a cylinder of its widest diameter for its whole
 * length, gives each tier over to a single pile type, and never staggers or
 * flips anything. That is deliberately wasteful: it is what a generic load
 * planner with no helix model would produce, and the number the helix-aware
 * packer has to beat.
 *
 * Because it ignores staggering, a lane pitch here is helix-OD plus clearance
 * rather than the helix-to-shaft pitch the real geometry allows.
 */

export interface Lane {
  readonly y: Millimetres;
}

export interface ArrangeResult {
  readonly plan: LoadPlan;
  /** Demand the arranger could not fit anywhere, with why. */
  readonly unplaced: readonly {
    readonly pileTypeId: string;
    readonly quantity: number;
    readonly reason: string;
  }[];
}

/** Lane centrelines for a tier given over to one pile type. */
export function lanesFor(
  vehicle: Vehicle,
  type: PileType,
  options: LoadingOptions,
): Lane[] {
  const halfWidth = maxRadius(type);
  const usable = vehicle.deckWidth - options.sideMargin * 2;
  if (usable < halfWidth * 2) {
    return [];
  }
  const pitch = halfWidth * 2 + options.clearance;
  const count = Math.floor((usable - halfWidth * 2) / pitch) + 1;
  const span = (count - 1) * pitch;
  return Array.from({length: count}, (_, index) => ({
    y: -span / 2 + index * pitch,
  }));
}

/** How many piles of a type fit end to end in one lane. */
export function pilesPerLane(
  vehicle: Vehicle,
  type: PileType,
  options: LoadingOptions,
): number {
  const usable = vehicle.deckLength - options.headboardGap;
  if (usable < type.length) {
    return 0;
  }
  return Math.floor((usable + options.endGap) / (type.length + options.endGap));
}

interface OpenTruck {
  readonly id: string;
  readonly vehicle: Vehicle;
  tier: number;
  heightUsed: Millimetres;
  massUsed: number;
}

export function arrangeNaively(
  job: Job,
  catalogue: Catalogue,
  vehicle: Vehicle,
  options: LoadingOptions,
  ruleset: VdamRuleset = NZ_VDAM_2016,
): ArrangeResult {
  const placements: Placement[] = [];
  const consignments: {id: string; vehicleId: string; phase: null}[] = [];
  const unplaced: {pileTypeId: string; quantity: number; reason: string}[] = [];

  const maxLoadHeight = ruleset.maxHeight - vehicle.deckHeight;
  const payload = payloadCapacity(vehicle);

  let truck: OpenTruck | null = null;
  // Returns rather than assigning the outer binding: a closure that writes to
  // `truck` would defeat the narrowing at the call site.
  function openTruck(): OpenTruck {
    const id = `C${consignments.length + 1}`;
    consignments.push({id, vehicleId: vehicle.id, phase: null});
    return {id, vehicle, tier: 0, heightUsed: 0, massUsed: 0};
  }

  /** Demand, widest first — a big-piles-first order keeps tiers from thrashing. */
  const demand = [...job.lines]
    .filter(line => line.quantity > 0)
    .map(line => ({line, type: findPileType(catalogue, line.pileTypeId)}))
    .filter(
      (entry): entry is {line: JobLine; type: PileType} =>
        entry.type !== undefined,
    )
    .sort((a, b) => b.type.length - a.type.length || b.type.mass - a.type.mass);

  for (const {line, type} of demand) {
    const lanes = lanesFor(vehicle, type, options);
    const perLane = pilesPerLane(vehicle, type, options);
    const tierHeight = tierHeightFor(type, options);
    const tierCapacity = lanes.length * perLane;

    // Reasons a pile can never go on this vehicle, checked once rather than
    // discovered by looping forever.
    if (lanes.length === 0) {
      unplaced.push({
        pileTypeId: type.id,
        quantity: line.quantity,
        reason: `too wide for the deck — needs ${maxRadius(type) * 2} mm plus margins, deck is ${vehicle.deckWidth} mm`,
      });
      continue;
    }
    if (perLane === 0) {
      unplaced.push({
        pileTypeId: type.id,
        quantity: line.quantity,
        reason: `too long for the deck — ${type.length} mm on a ${vehicle.deckLength} mm deck`,
      });
      continue;
    }
    if (tierHeight > maxLoadHeight) {
      unplaced.push({
        pileTypeId: type.id,
        quantity: line.quantity,
        reason: `a single tier is ${tierHeight} mm, over the ${maxLoadHeight} mm available under the height limit`,
      });
      continue;
    }
    if (type.mass > payload) {
      unplaced.push({
        pileTypeId: type.id,
        quantity: line.quantity,
        reason: `one pile is ${type.mass} kg, over the ${payload} kg payload`,
      });
      continue;
    }

    let remaining = line.quantity;
    while (remaining > 0) {
      if (
        truck === null ||
        truck.tier >= options.maxTiers ||
        truck.heightUsed + tierHeight > maxLoadHeight ||
        truck.massUsed + type.mass > payload
      ) {
        truck = openTruck();
      }

      const byMass = Math.floor((payload - truck.massUsed) / type.mass);
      const take = Math.min(remaining, tierCapacity, byMass);

      for (let index = 0; index < take; index++) {
        const lane = index % lanes.length;
        const slot = Math.floor(index / lanes.length);
        placements.push({
          id: `${truck.id}-T${truck.tier}-L${lane}-${slot}`,
          consignmentId: truck.id,
          pileTypeId: type.id,
          tier: truck.tier,
          x: options.headboardGap + slot * (type.length + options.endGap),
          y: lanes[lane]!.y,
          flipped: false,
        });
      }

      remaining -= take;
      truck.massUsed += take * type.mass;
      truck.heightUsed += tierHeight;
      truck.tier += 1;

      /*
       * A partly filled tier closes the truck. Nothing may be stacked on a
       * layer that does not cover the deck: the bearers for the tier above
       * would sit on fresh air over the empty part, and the piles on them
       * would be resting on nothing. `validatePlan` enforces this, and the
       * arranger must not knowingly produce a plan it would reject.
       */
      if (take < tierCapacity) {
        truck = null;
      }
    }
  }

  return {plan: {consignments, placements}, unplaced};
}
