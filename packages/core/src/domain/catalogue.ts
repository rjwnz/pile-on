import type {Kilograms} from '../units';
import type {VdamRuleset} from '../rules/nzVdam';
import type {PileType} from './pile';
import type {Placement} from './placement';
import {deckArea, isTrailer, payloadCapacity, type Vehicle} from './vehicle';

/** Reference data. Changes rarely, shared across every job. */
export interface Catalogue {
  readonly pileTypes: readonly PileType[];
  readonly vehicles: readonly Vehicle[];
}

export const EMPTY_CATALOGUE: Catalogue = {pileTypes: [], vehicles: []};

/** One movement: a truck, towing at most one trailer. */
export interface Consignment {
  readonly id: string;
  /** The self-propelled truck leading the movement. */
  readonly vehicleId: string;
  /** The trailer behind it, or null when the truck runs solo. */
  readonly trailerId: string | null;
  /** Delivery phase, or null for an unphased job. */
  readonly phase: string | null;
}

/**
 * A way the fleet can put decks on the road: a truck alone, or a truck towing
 * one of the trailers that lists it. Composed from the catalogue rather than
 * stored — the rows are units, and what may move with what is `towableBy`.
 */
export interface VehicleCombination {
  readonly truck: Vehicle;
  readonly trailer: Vehicle | null;
}

/** Trailers this truck is allowed to tow, in catalogue order. */
export function trailersFor(catalogue: Catalogue, truckId: string): Vehicle[] {
  return catalogue.vehicles.filter(vehicle =>
    vehicle.towableBy.includes(truckId),
  );
}

/**
 * Every combination the catalogue can field: each truck alone, then that truck
 * with each trailer naming it. Catalogue order, so the result is deterministic.
 * A trailer nobody can tow appears in no combination and so can carry nothing.
 */
export function combinationsOf(catalogue: Catalogue): VehicleCombination[] {
  const combinations: VehicleCombination[] = [];
  for (const truck of catalogue.vehicles) {
    if (isTrailer(truck)) {
      continue;
    }
    combinations.push({truck, trailer: null});
    for (const trailer of trailersFor(catalogue, truck.id)) {
      combinations.push({truck, trailer});
    }
  }
  return combinations;
}

/** Total deck area a combination commits, in square millimetres. */
export function combinationDeckArea(combo: VehicleCombination): number {
  return deckArea(combo.truck) + (combo.trailer ? deckArea(combo.trailer) : 0);
}

/**
 * Mass a movement can actually carry: the decks' own payloads, capped by what
 * the route allows the combination to gross.
 */
export function movementPayloadCapacity(
  combo: VehicleCombination,
  ruleset: VdamRuleset,
): Kilograms {
  const decksPayload =
    payloadCapacity(combo.truck) +
    (combo.trailer ? payloadCapacity(combo.trailer) : 0);
  const tares = combo.truck.tare + (combo.trailer?.tare ?? 0);
  return Math.min(decksPayload, ruleset.maxGrossMass - tares);
}

/**
 * A plan is a flat list of placements, not a nested tree. Lanes and tier
 * groupings are packer outputs, not facts about the load — everything
 * derivable is computed on demand and stored nowhere.
 */
export interface LoadPlan {
  readonly consignments: readonly Consignment[];
  readonly placements: readonly Placement[];
}

export const EMPTY_PLAN: LoadPlan = {
  consignments: [],
  placements: [],
};

export function findPileType(
  catalogue: Catalogue,
  id: string,
): PileType | undefined {
  return catalogue.pileTypes.find(type => type.id === id);
}

export function findVehicle(
  catalogue: Catalogue,
  id: string,
): Vehicle | undefined {
  return catalogue.vehicles.find(vehicle => vehicle.id === id);
}

/** Replace an entry with a matching id, or append it. */
export function upsertById<T extends {readonly id: string}>(
  items: readonly T[],
  item: T,
): T[] {
  const index = items.findIndex(existing => existing.id === item.id);
  if (index === -1) {
    return [...items, item];
  }
  const next = [...items];
  next[index] = item;
  return next;
}

export function removeById<T extends {readonly id: string}>(
  items: readonly T[],
  id: string,
): T[] {
  return items.filter(item => item.id !== id);
}
