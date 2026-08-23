import {
  combinationDeckArea,
  combinationsOf,
  findPileType,
  type Catalogue,
  type LoadPlan,
  type VehicleCombination,
} from '../domain/catalogue';
import {
  MAX_LOAD_HEIGHT,
  tierHeightFor,
  type LoadingOptions,
} from '../domain/loading';
import type {Job, JobLine} from '../domain/job';
import {maxRadius, type PileType} from '../domain/pile';
import type {DeckRole, Placement} from '../domain/placement';
import {
  balanceTargetOf,
  payloadCapacity,
  type Vehicle,
} from '../domain/vehicle';
import type {Kilograms, Millimetres} from '../units';
import {shiftToBalance} from './balance';
import {unplaceableOnFleet} from './feasibility';

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

interface OpenDeck {
  readonly role: DeckRole;
  readonly vehicle: Vehicle;
  tier: number;
  heightUsed: Millimetres;
  massUsed: Kilograms;
  /** True once a part-filled tier means nothing may stack on this deck. */
  closed: boolean;
}

interface OpenMovement {
  readonly id: string;
  readonly decks: readonly OpenDeck[];
}

/**
 * The one combination the baseline ever sends: the biggest thing the yard
 * owns, by total deck area — used for every movement, whatever the job looks
 * like. That is the honest naive answer to owning a fleet.
 */
function naiveCombination(catalogue: Catalogue): VehicleCombination | null {
  const combos = combinationsOf(catalogue);
  if (combos.length === 0) {
    return null;
  }
  return combos.reduce((biggest, combo) => {
    const byArea = combinationDeckArea(combo) - combinationDeckArea(biggest);
    if (byArea !== 0) {
      return byArea > 0 ? combo : biggest;
    }
    return combo.truck.id < biggest.truck.id ? combo : biggest;
  });
}

export function arrangeNaively(
  job: Job,
  catalogue: Catalogue,
  options: LoadingOptions,
): ArrangeResult {
  const placements: Placement[] = [];
  const consignments: {
    id: string;
    vehicleId: string;
    trailerId: string | null;
    phase: null;
  }[] = [];
  const unplaced: {pileTypeId: string; quantity: number; reason: string}[] = [];

  const combo = naiveCombination(catalogue);
  if (!combo) {
    for (const line of job.lines) {
      if (line.quantity > 0 && findPileType(catalogue, line.pileTypeId)) {
        unplaced.push({
          pileTypeId: line.pileTypeId,
          quantity: line.quantity,
          reason: 'no self-propelled truck in the catalogue',
        });
      }
    }
    return {plan: {consignments: [], placements: []}, unplaced};
  }

  let movement: OpenMovement | null = null;
  function openMovement(): OpenMovement {
    const id = `C${consignments.length + 1}`;
    consignments.push({
      id,
      vehicleId: combo!.truck.id,
      trailerId: combo!.trailer?.id ?? null,
      phase: null,
    });
    const decks: OpenDeck[] = [
      {
        role: 'truck',
        vehicle: combo!.truck,
        tier: 0,
        heightUsed: 0,
        massUsed: 0,
        closed: false,
      },
    ];
    if (combo!.trailer) {
      decks.push({
        role: 'trailer',
        vehicle: combo!.trailer,
        tier: 0,
        heightUsed: 0,
        massUsed: 0,
        closed: false,
      });
    }
    return {id, decks};
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

  // Usable span is the deck alone.
  const deckOnly = (vehicle: Vehicle) => ({
    length: vehicle.deckLength - options.headboardGap,
    width: vehicle.deckWidth - options.sideMargin * 2,
  });

  /** Whether this deck can take one more tier of this type, and how many piles. */
  function tierCapacity(deck: OpenDeck, type: PileType): number {
    if (deck.closed || deck.tier >= options.maxTiers) {
      return 0;
    }
    const tierHeight = tierHeightFor(type, options);
    if (deck.heightUsed + tierHeight > MAX_LOAD_HEIGHT) {
      return 0;
    }
    const spare =
      payloadCapacity(deck.vehicle) -
      deck.massUsed -
      options.ancillaryMassPerTier;
    const byMass = Math.floor(spare / type.mass);
    return Math.max(
      0,
      Math.min(cellsFor(deck.vehicle, type, options).length, byMass),
    );
  }

  for (const {line, type} of demand) {
    const reason = unplaceableOnFleet(type, [combo], options, deckOnly);
    if (reason) {
      unplaced.push({pileTypeId: type.id, quantity: line.quantity, reason});
      continue;
    }

    let remaining = line.quantity;
    while (remaining > 0) {
      if (movement === null) {
        movement = openMovement();
      }

      const deck = movement.decks.find(entry => tierCapacity(entry, type) > 0);

      if (!deck) {
        // Neither deck takes even one pile. A fresh movement whose decks both
        // refuse can never accept this type, so report rather than loop.
        const fresh = movement.decks.every(
          entry => entry.tier === 0 && !entry.closed,
        );
        if (fresh) {
          unplaced.push({
            pileTypeId: type.id,
            quantity: remaining,
            reason: 'no room on the naive combination once bearers are counted',
          });
          break;
        }
        movement = null;
        continue;
      }

      const cells = cellsFor(deck.vehicle, type, options);
      const take = Math.min(remaining, tierCapacity(deck, type));

      for (let index = 0; index < take; index++) {
        const cell = cells[index]!;
        placements.push({
          id: `${movement.id}-${deck.role}-T${deck.tier}-${index}`,
          consignmentId: movement.id,
          deck: deck.role,
          pileTypeId: type.id,
          tier: deck.tier,
          x: cell.x,
          y: cell.y,
          flipped: false,
        });
      }

      remaining -= take;
      deck.massUsed += take * type.mass + options.ancillaryMassPerTier;
      deck.heightUsed += tierHeightFor(type, options);
      deck.tier += 1;

      // A partly filled tier closes the deck: nothing may stack on a layer
      // that does not cover it, and `validatePlan` enforces that.
      if (take < cells.length) {
        deck.closed = true;
        if (movement.decks.every(entry => entry.closed)) {
          movement = null;
        }
      }
    }
  }

  // Slide each finished deck onto its own balance point, whole — so the shift
  // cannot affect separation or support.
  const balanced = consignments.flatMap(consignment => {
    const decks: {role: DeckRole; vehicle: Vehicle}[] = [
      {role: 'truck', vehicle: combo.truck},
    ];
    if (combo.trailer) {
      decks.push({role: 'trailer', vehicle: combo.trailer});
    }
    return decks.flatMap(({role, vehicle}) =>
      shiftToBalance(
        placements.filter(
          p => p.consignmentId === consignment.id && p.deck === role,
        ),
        catalogue,
        vehicle,
      ),
    );
  });

  return {plan: {consignments, placements: balanced}, unplaced};
}
