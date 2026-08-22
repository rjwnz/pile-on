import {findPileType, type Catalogue, type LoadPlan} from '../domain/catalogue';
import {tierHeightFor, type LoadingOptions} from '../domain/loading';
import type {Job, JobLine} from '../domain/job';
import {maxRadius, type PileType} from '../domain/pile';
import type {Placement} from '../domain/placement';
import {
  balanceTargetOf,
  payloadCapacity,
  type Vehicle,
} from '../domain/vehicle';
import {NZ_VDAM_2016, type VdamRuleset} from '../rules/nzVdam';
import type {Millimetres} from '../units';
import {shiftToBalance} from './balance';
import {unplaceableReason} from './feasibility';

/**
 * The naive bounding-box arranger — the *control* the packer has to beat.
 * Every pile is a cylinder of its widest diameter, one type per tier, nothing
 * staggered or flipped. Licensed to pack badly, not illegally: a baseline that
 * fails `validatePlan` measures nothing.
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
  // Every pile is its widest all the way along, so neighbouring lanes always
  // present plate to plate. Nothing here ever staggers them apart.
  const pitch = halfWidth * 2 + options.clearances.helixToHelix;
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

/** A place one pile can go in a tier given over to a single type. */
interface Cell {
  readonly x: Millimetres;
  readonly y: Millimetres;
}

/**
 * Every slot in a single-type tier, ordered so that *any* prefix is balanced —
 * each cell greedily picked to keep the running centre of mass on target. A
 * full tier uses all of them either way; this decides where the leftovers sit
 * when demand runs out mid-tier.
 */
export function cellsFor(
  vehicle: Vehicle,
  type: PileType,
  options: LoadingOptions,
): Cell[] {
  const lanes = lanesFor(vehicle, type, options);
  const slots = pilesPerLane(vehicle, type, options);
  const targetX = balanceTargetOf(vehicle);

  const remaining: Cell[] = [];
  for (let slot = 0; slot < slots; slot++) {
    for (const lane of lanes) {
      remaining.push({
        x: options.headboardGap + slot * (type.length + options.endGap),
        y: lane.y,
      });
    }
  }

  const chosen: Cell[] = [];
  let sumX = 0;
  let sumY = 0;
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = Infinity;
    for (const [index, cell] of remaining.entries()) {
      const count = chosen.length + 1;
      const meanX = (sumX + cell.x + type.length / 2) / count;
      const meanY = (sumY + cell.y) / count;
      const score = Math.hypot(meanX - targetX, meanY);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    const [cell] = remaining.splice(bestIndex, 1) as [Cell];
    sumX += cell.x + type.length / 2;
    sumY += cell.y;
    chosen.push(cell);
  }
  return chosen;
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
  const consignments: {
    id: string;
    vehicleId: string;
    trailerId: null;
    phase: null;
  }[] = [];
  const unplaced: {pileTypeId: string; quantity: number; reason: string}[] = [];

  const maxLoadHeight = ruleset.maxHeight - vehicle.deckHeight;
  const payload = payloadCapacity(vehicle);

  let truck: OpenTruck | null = null;
  // Returns rather than assigning the outer binding: a closure that writes to
  // `truck` would defeat the narrowing at the call site.
  function openTruck(): OpenTruck {
    const id = `C${consignments.length + 1}`;
    consignments.push({
      id,
      vehicleId: vehicle.id,
      trailerId: null,
      phase: null,
    });
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
    const cells = cellsFor(vehicle, type, options);
    const tierHeight = tierHeightFor(type, options);

    // The baseline stops at the tailgate — it does not use overhang — so the
    // usable length it reports is the deck alone.
    const reason = unplaceableReason(type, vehicle, options, ruleset, {
      length: vehicle.deckLength - options.headboardGap,
      width: vehicle.deckWidth - options.sideMargin * 2,
    });
    if (reason) {
      unplaced.push({pileTypeId: type.id, quantity: line.quantity, reason});
      continue;
    }

    let remaining = line.quantity;
    while (remaining > 0) {
      if (
        truck === null ||
        truck.tier >= options.maxTiers ||
        truck.heightUsed + tierHeight > maxLoadHeight ||
        truck.massUsed + type.mass + options.ancillaryMassPerTier > payload
      ) {
        truck = openTruck();
      }

      // The bearers for this tier land on the payload before any pile does.
      const spare = payload - truck.massUsed - options.ancillaryMassPerTier;
      const byMass = Math.floor(spare / type.mass);
      const take = Math.min(remaining, cells.length, byMass);

      for (let index = 0; index < take; index++) {
        const cell = cells[index]!;
        placements.push({
          id: `${truck.id}-T${truck.tier}-${index}`,
          consignmentId: truck.id,
          deck: 'truck',
          pileTypeId: type.id,
          tier: truck.tier,
          x: cell.x,
          y: cell.y,
          flipped: false,
        });
      }

      remaining -= take;
      truck.massUsed += take * type.mass + options.ancillaryMassPerTier;
      truck.heightUsed += tierHeight;
      truck.tier += 1;

      // A partly filled tier closes the truck: nothing may stack on a layer
      // that does not cover the deck, and `validatePlan` enforces it.
      if (take < cells.length) {
        truck = null;
      }
    }
  }

  // Slide each finished load onto its balance point, whole — so the shift
  // cannot affect separation or support.
  const balanced = consignments.flatMap(consignment =>
    shiftToBalance(
      placements.filter(p => p.consignmentId === consignment.id),
      catalogue,
      vehicle,
    ),
  );

  return {plan: {consignments, placements: balanced}, unplaced};
}
