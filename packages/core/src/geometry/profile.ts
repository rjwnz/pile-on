import type {Millimetres} from '../units';
import type {PileType} from '../domain/pile';
import type {PlacedPile, Placement} from '../domain/placement';

/**
 * A pile reduced to "how far out does it stick, at each station along the deck".
 *
 * This is the representation the packer works in. A pile is a shaft segment
 * spanning its whole length plus a short, fat segment at each helix. Because
 * every pile lies parallel to the deck, lateral packing only ever needs to
 * compare these one-dimensional profiles.
 */
export interface RadiusSegment {
  /** Absolute deck coordinate of the segment start. */
  readonly start: Millimetres;
  /** Absolute deck coordinate of the segment end. */
  readonly end: Millimetres;
  readonly radius: Millimetres;
  readonly kind: 'shaft' | 'helix';
}

/** Where a pile's helix sits on the deck once placed and possibly flipped. */
function helixCentre(
  type: PileType,
  placement: Placement,
  offsetFromButt: Millimetres,
): Millimetres {
  const alongPile = placement.flipped
    ? type.length - offsetFromButt
    : offsetFromButt;
  return placement.x + alongPile;
}

/**
 * Build the radius profile of a placed pile.
 *
 * The shaft segment always comes first, so a linear scan can assume index 0 is
 * the full extent. Helix segments are clamped to the pile extent — a plate at
 * the very tip must not report steel hanging off the end of the pile.
 */
export function radiusProfile(placed: PlacedPile): RadiusSegment[] {
  const {type, placement} = placed;
  const start = placement.x;
  const end = placement.x + type.length;

  const segments: RadiusSegment[] = [
    {start, end, radius: type.shaftRadius, kind: 'shaft'},
  ];

  for (const helix of type.helices) {
    const centre = helixCentre(type, placement, helix.offsetFromButt);
    const half = helix.length / 2;
    const helixStart = Math.max(start, centre - half);
    const helixEnd = Math.min(end, centre + half);
    if (helixEnd > helixStart) {
      segments.push({
        start: helixStart,
        end: helixEnd,
        radius: helix.radius,
        kind: 'helix',
      });
    }
  }

  return segments;
}

/**
 * Largest helix radius covering `station`, or 0 where the pile presents only
 * shaft. Half-open interval [start, end) so that abutting segments do not
 * double-count at the boundary.
 */
export function helixRadiusAt(
  profile: readonly RadiusSegment[],
  station: Millimetres,
): Millimetres {
  let widest = 0;
  for (const segment of profile) {
    if (
      segment.kind === 'helix' &&
      station >= segment.start &&
      station < segment.end
    ) {
      widest = Math.max(widest, segment.radius);
    }
  }
  return widest;
}

/** Whether the pile occupies `station` at all. */
export function coversStation(
  profile: readonly RadiusSegment[],
  station: Millimetres,
): boolean {
  return profile.some(
    segment => station >= segment.start && station < segment.end,
  );
}

/**
 * Sorted, de-duplicated breakpoints of two profiles — every x at which either
 * profile's radius can change. Between consecutive breakpoints both profiles
 * are constant, so the pair only has to be evaluated once per interval.
 */
export function breakpoints(
  a: readonly RadiusSegment[],
  b: readonly RadiusSegment[],
): Millimetres[] {
  const points = new Set<Millimetres>();
  for (const segment of [...a, ...b]) {
    points.add(segment.start);
    points.add(segment.end);
  }
  return [...points].sort((p, q) => p - q);
}
