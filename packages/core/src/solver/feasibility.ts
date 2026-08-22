import {tierHeightFor, type LoadingOptions} from '../domain/loading';
import {maxRadius, type PileType} from '../domain/pile';
import {payloadCapacity, type Vehicle} from '../domain/vehicle';
import type {VdamRuleset} from '../rules/nzVdam';
import type {Millimetres} from '../units';

/**
 * Why a pile type can never go on this vehicle, or null if it can.
 *
 * Shared by both arrangers so the two never explain the same impossibility in
 * different words. They pass their own usable span, because they do not agree
 * on one: the baseline stops at the tailgate, and the packer will use a rear
 * overhang the yard has said it will accept.
 *
 * Checked once per type rather than discovered by a loop that never terminates.
 */
export function unplaceableReason(
  type: PileType,
  vehicle: Vehicle,
  options: LoadingOptions,
  ruleset: VdamRuleset,
  usable: {readonly length: Millimetres; readonly width: Millimetres},
): string | null {
  if (usable.width < maxRadius(type) * 2) {
    return `too wide for the deck — needs ${maxRadius(type) * 2} mm plus margins, deck is ${vehicle.deckWidth} mm`;
  }
  if (usable.length < type.length) {
    return `too long for the deck — ${type.length} mm on a ${vehicle.deckLength} mm deck`;
  }
  const tierHeight = tierHeightFor(type, options);
  const maxLoadHeight = ruleset.maxHeight - vehicle.deckHeight;
  if (tierHeight > maxLoadHeight) {
    return `a single tier is ${tierHeight} mm, over the ${maxLoadHeight} mm available under the height limit`;
  }
  const payload = payloadCapacity(vehicle);
  if (type.mass + options.ancillaryMassPerTier > payload) {
    return `one pile plus its bearers is ${type.mass + options.ancillaryMassPerTier} kg, over the ${payload} kg payload`;
  }
  return null;
}
