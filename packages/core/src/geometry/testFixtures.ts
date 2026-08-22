import type {Helix, PileType} from '../domain/pile';
import type {PlacedPile, Placement} from '../domain/placement';
import type {Millimetres} from '../units';

/**
 * Shared fixtures for geometry tests. Deliberately round numbers so that the
 * expected separations in the tests can be checked by hand:
 *
 *   shaft radius 60 mm  (Ø120 shaft)
 *   helix radius 200 mm (Ø400 plate)
 *   helix thickness 100 mm
 *   length 6000 mm
 */
export const SHAFT_RADIUS: Millimetres = 60;
export const HELIX_RADIUS: Millimetres = 200;
export const HELIX_LENGTH: Millimetres = 100;
export const PILE_LENGTH: Millimetres = 6000;

export function helixAt(
  offsetFromButt: Millimetres,
  overrides: Partial<Helix> = {},
): Helix {
  return {
    offsetFromButt,
    radius: HELIX_RADIUS,
    length: HELIX_LENGTH,
    ...overrides,
  };
}

export function pileType(
  id: string,
  helices: readonly Helix[],
  overrides: Partial<PileType> = {},
): PileType {
  return {
    id,
    name: id,
    length: PILE_LENGTH,
    shaftRadius: SHAFT_RADIUS,
    mass: 250,
    helices,
    ...overrides,
  };
}

/** A plain shaft with no helices. */
export const PLAIN = pileType('plain', []);

/** One plate, 500 mm up from the butt. */
export const SINGLE = pileType('single', [helixAt(500)]);

/** Two plates, at 500 mm and 1200 mm from the butt. */
export const DOUBLE = pileType('double', [helixAt(500), helixAt(1200)]);

export function place(
  type: PileType,
  overrides: Partial<Placement> = {},
): PlacedPile {
  return {
    type,
    placement: {
      id: `${type.id}-1`,
      consignmentId: 'C1',
      pileTypeId: type.id,
      tier: 0,
      x: 0,
      y: 0,
      flipped: false,
      ...overrides,
    },
  };
}
