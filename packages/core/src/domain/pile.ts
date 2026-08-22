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
