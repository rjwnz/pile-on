import type {Kilograms, Millimetres} from '../units';

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
 * A deck to load, and the mass it may carry. Deliberately no axles: payload is
 * always reached before any axle limit in this operation, so mass compliance
 * is `payloadCapacity` and nothing else. The operator states that capacity
 * directly — tare and gross rating are not modelled, because the load figure
 * is the only one the packer and the rules ever consult.
 */
export interface Vehicle {
  readonly id: string;
  readonly name: string;
  readonly kind: VehicleKind;
  readonly deckLength: Millimetres;
  readonly deckWidth: Millimetres;
  /** Mass this deck may carry: piles, dunnage and restraint together. */
  readonly payloadCapacity: Kilograms;
  /**
   * Ids of the trucks allowed to tow this row. Non-empty marks the row as a
   * trailer, which never moves on its own; empty is a self-propelled truck.
   * `kind` is labels elsewhere — this is the one field that decides what may
   * move with what.
   */
  readonly towableBy: readonly string[];
}

/** Whether this row is a towed unit rather than a self-propelled truck. */
export function isTrailer(vehicle: Vehicle): boolean {
  return vehicle.towableBy.length > 0;
}

/** Mass available for piles, dunnage and restraint. */
export function payloadCapacity(vehicle: Vehicle): Kilograms {
  return vehicle.payloadCapacity;
}

/** Usable deck area, in square millimetres. */
export function deckArea(vehicle: Vehicle): number {
  return vehicle.deckLength * vehicle.deckWidth;
}

/** Where the load centroid should sit along the deck: always mid-length. */
export function balanceTargetOf(vehicle: Vehicle): Millimetres {
  return vehicle.deckLength / 2;
}

/** Longitudinal span a load may occupy — headboard to tailgate, no overhang. */
export function loadableSpan(
  vehicle: Vehicle,
): readonly [Millimetres, Millimetres] {
  return [0, vehicle.deckLength];
}
