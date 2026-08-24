import type {Helix, PileType} from './domain/pile';
import type {PlacedPile, Placement} from './domain/placement';
import type {Vehicle} from './domain/vehicle';
import type {Job} from './domain/job';
import type {Millimetres} from './units';

/**
 * The fixtures every suite works from. Two families, and they are for
 * different jobs.
 *
 * The **geometry** family below is deliberately round numbers, so the
 * separations a test expects can be checked by hand:
 *
 *   shaft radius 60 mm  (Ø120 shaft)
 *   helix radius 200 mm (Ø400 plate)
 *   helix thickness 100 mm
 *   length 6000 mm
 *
 * The **catalogue** family further down is real steel on a real deck, because
 * a pile count or a truck count only means something against sections the
 * yard actually stocks. Shared rather than restated per suite: the packer, the
 * validator and the drawings have to be judged against the same load, and a
 * fixture that drifts in one file is a test that stops comparing.
 */

export const SHAFT_RADIUS: Millimetres = 60;
export const HELIX_RADIUS: Millimetres = 200;
const HELIX_LENGTH: Millimetres = 100;
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
      deck: 'truck',
      pileTypeId: type.id,
      tier: 0,
      pack: 0,
      x: 0,
      y: 0,
      flipped: false,
      ...overrides,
    },
  };
}

/** 168.3 × 7.1 CHS, twin helix — the type the business case is quoted on. */
export const SP168: PileType = {
  id: 'SP168-D6',
  name: 'SP168 6.0 m twin helix',
  length: 6000,
  shaftRadius: 84,
  mass: 178,
  helices: [
    {offsetFromButt: 400, radius: 225, length: 110},
    {offsetFromButt: 1100, radius: 175, length: 110},
  ],
};

/** 139.7 × 6.0 CHS, single helix — the one whose plates may interleave. */
export const SP139: PileType = {
  id: 'SP139-S4',
  name: 'SP139 4.5 m single helix',
  length: 4500,
  shaftRadius: 70,
  mass: 96,
  helices: [{offsetFromButt: 350, radius: 175, length: 90}],
};

/** A starter and an extension of one code, for the pack rules. */
export const SS200_STARTER: PileType = {
  id: 'SS200-starter',
  name: 'SS200 starter',
  length: 6000,
  shaftRadius: 84,
  mass: 178,
  helices: [{offsetFromButt: 400, radius: 225, length: 110}],
};

export const SS200_EXTENSION: PileType = {
  id: 'SS200-ext-6000',
  name: 'SS200 extension',
  length: 6000,
  shaftRadius: 84,
  mass: 132,
  helices: [],
};

/** Tractor and 4-axle semi: the deck almost every suite loads onto. */
export const SEMI: Vehicle = {
  id: 'SEMI-45',
  name: 'Tractor + 4-axle semi',
  kind: 'semi_trailer',
  deckLength: 12500,
  deckWidth: 2450,
  payloadCapacity: 28200,
  towableBy: [],
};

/** A job from `[pileTypeId, quantity]` pairs. */
export function job(...lines: [string, number][]): Job {
  return {
    name: 'test',
    lines: lines.map(([pileTypeId, quantity]) => ({pileTypeId, quantity})),
  };
}
