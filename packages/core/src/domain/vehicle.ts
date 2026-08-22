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
 * is `payloadCapacity` and nothing else.
 */
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
  /** How far a load may hang past each end of the deck. Not derived — VDAM
   * states it against axle spacing, which is not modelled — but what the yard
   * accepts on this unit. Zero is the safe default. */
  readonly maxFrontOverhang: Millimetres;
  readonly maxRearOverhang: Millimetres;
  /** Where this deck wants its load centroid, from the headboard. Null means
   * unstated (mid-length assumed) — kept separate so the assumption stays
   * visible. */
  readonly balanceTarget: Millimetres | null;
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
  return vehicle.maxGross - vehicle.tare;
}

/** Usable deck area, in square millimetres. */
export function deckArea(vehicle: Vehicle): number {
  return vehicle.deckLength * vehicle.deckWidth;
}

/** Where the load centroid should sit along the deck, mid-length if unstated. */
export function balanceTargetOf(vehicle: Vehicle): Millimetres {
  return vehicle.balanceTarget ?? vehicle.deckLength / 2;
}

/** Longitudinal span a load may occupy, overhang allowances included. */
export function loadableSpan(
  vehicle: Vehicle,
): readonly [Millimetres, Millimetres] {
  return [
    -vehicle.maxFrontOverhang,
    vehicle.deckLength + vehicle.maxRearOverhang,
  ];
}
