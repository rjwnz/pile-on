import type {PileType} from './pile';
import type {Placement} from './placement';
import type {Vehicle} from './vehicle';

/** Reference data. Changes rarely, shared across every job. */
export interface Catalogue {
  readonly pileTypes: readonly PileType[];
  readonly vehicles: readonly Vehicle[];
}

export const EMPTY_CATALOGUE: Catalogue = {pileTypes: [], vehicles: []};

/** One truck movement. */
export interface Consignment {
  readonly id: string;
  readonly vehicleId: string;
  /** Delivery phase, or null for an unphased job. */
  readonly phase: string | null;
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
