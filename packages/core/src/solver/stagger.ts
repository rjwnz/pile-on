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
 * Every longitudinal offset worth trying for a lane, given what is already
 * beside it.
 *
 * This is the idea the whole packer rests on. Sliding a lane along the deck
 * changes the separation its neighbour needs, but not continuously: the
 * requirement only changes where one pile's plate starts or stops sharing a
 * station with another's. Between those points nothing changes at all.
 *
 * So the offsets worth evaluating are exactly the boundaries of those windows.
 * For a plate `[s, e]` on this lane and `[s', e']` on a neighbour, they overlap
 * for offsets strictly inside `(s' − e, e' − s)`, so the two ends of that range
 * are where the answer flips — and every distinct answer is reachable from one
 * of them. The search is finite and *exact*: there is no sampling step, and no
 * better offset hiding between two that were tried.
 *
 * Add zero and the full slack so a lane with no useful stagger still has
 * somewhere to sit, and so the two extremes of the travel are always on the
 * list.
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
