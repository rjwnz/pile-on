import type {Kilograms, Millimetres} from '../units';

/**
 * A single helical plate welded to the shaft.
 *
 * `offsetFromButt` is measured in pile-local coordinates from the butt (the
 * blunt, driven end) toward the tip, so it is independent of how the pile ends
 * up oriented on the deck.
 */
export interface Helix {
  /** Distance from the butt to the centre plane of the plate. */
  readonly offsetFromButt: Millimetres;
  /** Outer radius of the plate, measured from the shaft axis. */
  readonly radius: Millimetres;
  /**
   * Axial length of the helix along the shaft: the plate thickness plus the
   * rise of its flight. A helix is a short fat cylinder, not a flat disc, and
   * this is how long that cylinder is.
   *
   * It decides whether two helices share a station on the deck, and therefore
   * whether staggering buys anything — so it is worth getting right rather
   * than defaulting to the plate gauge.
   */
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

/**
 * Whether this type may have its helices overlap a neighbour's helices.
 *
 * Single-helix piles nest: the plates sit beside each other horizontally at the
 * same level, so their swept circles may overlap in plan. Double-helix piles
 * cannot — with two plates on one shaft there is no rotation that lets a
 * neighbour's plate through.
 *
 * This is a property of the *pair*, not the pile: see `helicesMayInterleave`.
 */
export function isSingleHelix(type: PileType): boolean {
  return type.helices.length === 1;
}

/**
 * Whether two adjacent piles may have their helices overlap in plan view.
 *
 * Only true when *both* are single-helix. A double-helix pile forces full
 * helix-to-helix separation against any neighbour, single or double.
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
