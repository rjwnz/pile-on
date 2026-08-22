import type {PlacedPile} from '../domain/placement';
import {radiusProfile} from '../geometry/profile';
import type {Millimetres} from '../units';

/** A stretch of deck over which a pile presents a helix plate. */
export interface Interval {
  readonly start: Millimetres;
  readonly end: Millimetres;
}

/** Where each of these piles has steel wider than its shaft, along the deck. */
export function helixIntervals(placed: readonly PlacedPile[]): Interval[] {
  return placed.flatMap(pile =>
    radiusProfile(pile)
      .filter(segment => segment.kind === 'helix')
      .map(segment => ({start: segment.start, end: segment.end})),
  );
}

/**
 * Every longitudinal offset worth trying for a lane — the idea the packer
 * rests on. The separation a neighbour needs only changes where one plate
 * starts or stops sharing a station with another, so those boundaries are the
 * complete, exact candidate set: nothing better hides between two of them.
 * Zero and the full slack are always included.
 */
export function staggerOffsets(
  own: readonly Interval[],
  neighbours: readonly Interval[],
  slack: Millimetres,
): Millimetres[] {
  const offsets = new Set<Millimetres>([0]);
  if (slack > 0) {
    offsets.add(slack);
  }

  for (const mine of own) {
    for (const theirs of neighbours) {
      // Slide my plate until it starts exactly where theirs stops, and until
      // it stops exactly where theirs starts. Segments are half-open, so
      // touching at a boundary is not sharing a station.
      for (const candidate of [
        theirs.end - mine.start,
        theirs.start - mine.end,
      ]) {
        if (candidate > 0 && candidate < slack) {
          offsets.add(candidate);
        }
      }
    }
  }

  return [...offsets].sort((a, b) => a - b);
}
