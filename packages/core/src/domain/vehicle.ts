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
 * A deck to load, and the mass it may carry.
 *
 * Deliberately no axles. In this operation the total payload limit is always
 * reached before any individual axle or axle-set limit, so modelling axle
 * positions, tyre classes and the VDAM bridge formula bought complexity — and a
 * deck-origin-to-axle coordinate mapping — for a constraint that never binds.
 * Mass compliance is `payloadCapacity`, and nothing else.
 *
 * Even distribution is still required, but that is a load-balance question
 * (centroid against the deck centre and the centreline) and does not need axle
 * geometry to answer.
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
  /**
   * How far a load may hang past the front of the deck, and past the rear.
   *
   * VDAM states rear overhang as the lesser of a fixed distance and a fraction
   * of the axle spacing — which needs axle positions, and those were removed on
   * purpose. So this is not derived: it is what the yard will accept on this
   * unit, and zero (the load must fit on the deck) is the safe default.
   */
  readonly maxFrontOverhang: Millimetres;
  readonly maxRearOverhang: Millimetres;
  /**
   * Where this deck wants its load centroid, measured from the headboard.
   *
   * Null means nobody has said, and mid-length is assumed. That is a default,
   * not a truth — a semi wants mass forward toward the kingpin and a rigid with
   * a rear axle group does not, and without axle positions there is no way to
   * work out which. Recording "unstated" separately from a real figure keeps the
   * assumption visible instead of baking it in.
   */
  readonly balanceTarget: Millimetres | null;
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
