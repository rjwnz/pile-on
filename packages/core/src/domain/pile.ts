import type {Kilograms, Millimetres} from '../units';

/** A single helical plate welded to the shaft. */
export interface Helix {
  /** Butt (blunt end) to the centre plane of the plate, in pile-local mm. */
  readonly offsetFromButt: Millimetres;
  /** Outer radius of the plate, measured from the shaft axis. */
  readonly radius: Millimetres;
  /** Axial length along the shaft: plate thickness plus the rise of its
   * flight — a helix is a short fat cylinder, not a flat disc. */
  readonly length: Millimetres;
}

/** A catalogue entry. Many piles on a job share one type. */
export interface PileType {
  readonly id: string;
  readonly name: string;
  readonly length: Millimetres;
  /** Outer radius of the shaft — the hard, never-negotiable clearance. */
  readonly shaftRadius: Millimetres;
  readonly mass: Kilograms;
  /** Ordered by `offsetFromButt`. Empty for a plain shaft. */
  readonly helices: readonly Helix[];
}

/** Single-helix piles nest their plates beside each other; see `helicesMayInterleave`. */
export function isSingleHelix(type: PileType): boolean {
  return type.helices.length === 1;
}

/**
 * Whether two adjacent piles may have their helices overlap in plan view —
 * only when *both* are single-helix. A double-helix pile forces full
 * plate-to-plate separation against any neighbour.
 */
export function helicesMayInterleave(a: PileType, b: PileType): boolean {
  return isSingleHelix(a) && isSingleHelix(b);
}

/** Largest radius anywhere on the pile — the bounding-cylinder radius. */
export function maxRadius(type: PileType): Millimetres {
  return type.helices.reduce(
    (widest, helix) => Math.max(widest, helix.radius),
    type.shaftRadius,
  );
}

/**
 * A pile ships as a starter — which carries the helices — and plain-shaft
 * extensions joined to it on site. Each piece loads separately, so each is its
 * own catalogue entry; the id ties the pieces together by encoding a shared
 * pile-type code and which part it is. An extension carries its length so one
 * pile type can list several extension lengths without their ids colliding.
 *
 * The encoding lives here so the form, the CSV importer and the table all read
 * and write it the same way.
 */
export const PILE_PARTS = ['starter', 'extension'] as const;
export type PilePart = (typeof PILE_PARTS)[number];

const STARTER_ID = /^(.+)-starter$/;
const EXTENSION_ID = /^(.+)-ext-\d+$/;

/** The catalogue id for a pile-type code and part. */
export function pileId(
  code: string,
  part: PilePart,
  length: Millimetres,
): string {
  return part === 'starter' ? `${code}-starter` : `${code}-ext-${length}`;
}

/** The default name when none is stated: e.g. "SP1 starter". */
export function pileName(code: string, part: PilePart): string {
  return `${code} ${part}`;
}

/** Which part a stored pile is. An older id nobody encoded is read off its
 * helices — a starter carries plates, an extension does not. */
export function pilePartOf(type: PileType): PilePart {
  if (STARTER_ID.test(type.id)) {
    return 'starter';
  }
  if (EXTENSION_ID.test(type.id)) {
    return 'extension';
  }
  return type.helices.length > 0 ? 'starter' : 'extension';
}

/** The shared pile-type code a stored pile belongs to. */
export function pileTypeCode(type: PileType): string {
  const starter = STARTER_ID.exec(type.id);
  if (starter) {
    return starter[1]!;
  }
  const extension = EXTENSION_ID.exec(type.id);
  if (extension) {
    return extension[1]!;
  }
  return type.id;
}
