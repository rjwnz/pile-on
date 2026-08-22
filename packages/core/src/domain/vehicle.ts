import type {Kilograms, Millimetres} from '../units';

/** Tyre classes from VDAM factsheet 13 — they set the per-axle mass limit. */
export const TYRE_CLASSES = ['S', 'SL', 'SM', 'T'] as const;
export type TyreClass = (typeof TYRE_CLASSES)[number];

export const TYRE_CLASS_LABELS: Readonly<Record<TyreClass, string>> = {
  S: 'Single standard (<355 mm)',
  SL: 'Single large (355–443 mm)',
  SM: 'Single mega (444 mm+)',
  T: 'Twin',
};

export const VEHICLE_KINDS = [
  'rigid',
  'semi_trailer',
  'full_trailer',
  'simple_trailer',
  'b_train',
] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

export const VEHICLE_KIND_LABELS: Readonly<Record<VehicleKind, string>> = {
  rigid: 'Rigid truck',
  semi_trailer: 'Semi-trailer',
  full_trailer: 'Full trailer',
  simple_trailer: 'Simple trailer',
  b_train: 'B-train',
};

/**
 * One axle.
 *
 * Positions and tyre classes are held per axle rather than as a single payload
 * figure because that is what the limits are actually written against: the
 * axle-set and combined axle-set tables are functions of spacing and tyre
 * class, and that is where a load fails in practice.
 */
export interface Axle {
  readonly xFromFront: Millimetres;
  readonly tyreClass: TyreClass;
  /** Axles sharing a set id are treated as one group for the set limits. */
  readonly setId: string;
  readonly steering: boolean;
}

export interface Vehicle {
  readonly id: string;
  readonly name: string;
  readonly kind: VehicleKind;
  readonly deckLength: Millimetres;
  readonly deckWidth: Millimetres;
  /** Deck surface height above the road — counts against the 4.3 m limit. */
  readonly deckHeight: Millimetres;
  readonly tare: Kilograms;
  /** GVM for a rigid, GCM for a combination. */
  readonly maxGross: Kilograms;
  readonly axles: readonly Axle[];
}

/** Mass available for piles, dunnage and restraint. */
export function payloadCapacity(vehicle: Vehicle): Kilograms {
  return vehicle.maxGross - vehicle.tare;
}

/** Distinct axle set ids, in the order the axles appear along the vehicle. */
export function axleSetIds(vehicle: Vehicle): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const axle of vehicle.axles) {
    if (!seen.has(axle.setId)) {
      seen.add(axle.setId);
      order.push(axle.setId);
    }
  }
  return order;
}

/** Distance from the foremost to the rearmost axle — the bridge-formula span. */
export function axleSpan(vehicle: Vehicle): Millimetres {
  if (vehicle.axles.length < 2) {
    return 0;
  }
  const positions = vehicle.axles.map(axle => axle.xFromFront);
  return Math.max(...positions) - Math.min(...positions);
}
