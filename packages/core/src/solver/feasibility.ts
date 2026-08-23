import type {VehicleCombination} from '../domain/catalogue';
import {
  MAX_LOAD_HEIGHT,
  tierHeightFor,
  type LoadingOptions,
} from '../domain/loading';
import {maxRadius, type PileType} from '../domain/pile';
import {deckArea, payloadCapacity, type Vehicle} from '../domain/vehicle';
import type {Millimetres} from '../units';

/** Why a pile type can never go on this vehicle, or null if it can. */
export function unplaceableReason(
  type: PileType,
  vehicle: Vehicle,
  options: LoadingOptions,
  usable: {readonly length: Millimetres; readonly width: Millimetres},
): string | null {
  if (usable.width < maxRadius(type) * 2) {
    return `too wide for the deck — needs ${maxRadius(type) * 2} mm plus margins, deck is ${vehicle.deckWidth} mm`;
  }
  if (usable.length < type.length) {
    return `too long for the deck — ${type.length} mm on a ${vehicle.deckLength} mm deck`;
  }
  const tierHeight = tierHeightFor(type, options);
  if (tierHeight > MAX_LOAD_HEIGHT) {
    return `a single tier is ${tierHeight} mm, over the ${MAX_LOAD_HEIGHT} mm a deck can carry`;
  }
  const payload = payloadCapacity(vehicle);
  if (type.mass + options.ancillaryMassPerTier > payload) {
    return `one pile plus its bearers is ${type.mass + options.ancillaryMassPerTier} kg, over the ${payload} kg payload`;
  }
  return null;
}

/**
 * Why a pile type fits nowhere in the fleet, or null if some reachable deck
 * takes it. A deck is reachable through a combination — a trailer nobody can
 * tow is not part of the fleet, however good its deck. When nothing fits, the
 * reason quoted is the most accommodating deck's, so the user reads the
 * nearest miss rather than the worst one.
 */
export function unplaceableOnFleet(
  type: PileType,
  combinations: readonly VehicleCombination[],
  options: LoadingOptions,
  usableOf: (vehicle: Vehicle) => {
    readonly length: Millimetres;
    readonly width: Millimetres;
  },
): string | null {
  const decks = new Map<string, Vehicle>();
  for (const combo of combinations) {
    decks.set(combo.truck.id, combo.truck);
    if (combo.trailer) {
      decks.set(combo.trailer.id, combo.trailer);
    }
  }
  if (decks.size === 0) {
    return 'no self-propelled truck in the catalogue';
  }

  let nearest: {vehicle: Vehicle; reason: string} | null = null;
  for (const deck of decks.values()) {
    const reason = unplaceableReason(type, deck, options, usableOf(deck));
    if (!reason) {
      return null;
    }
    if (
      !nearest ||
      usableOf(deck).length > usableOf(nearest.vehicle).length ||
      (usableOf(deck).length === usableOf(nearest.vehicle).length &&
        deckArea(deck) > deckArea(nearest.vehicle))
    ) {
      nearest = {vehicle: deck, reason};
    }
  }
  return `fits no vehicle in the fleet — best case (${nearest!.vehicle.name}): ${nearest!.reason}`;
}
