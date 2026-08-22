import type {Catalogue} from '../domain/catalogue';
import {findPileType} from '../domain/catalogue';
import type {LoadingOptions} from '../domain/loading';
import {maxRadius, type PileType} from '../domain/pile';
import type {Kilograms, Millimetres} from '../units';

/** One pile in a lane, before the lane knows where across the deck it sits. */
export interface LaneSlot {
  readonly pileTypeId: string;
  /** Along the deck, with the pattern pushed as far forward as it will go. */
  readonly x: Millimetres;
  readonly flipped: boolean;
}

/**
 * A way of filling one lane end to end. Mixed lengths are allowed, which is
 * why a pattern is a sequence rather than a count.
 */
export interface LanePattern {
  readonly slots: readonly LaneSlot[];
  /** How far the whole pattern may slide along the deck. The stagger budget. */
  readonly slack: Millimetres;
  /** Widest radius in the pattern — what the lane costs across the deck. */
  readonly halfWidth: Millimetres;
  readonly mass: Kilograms;
  /** Deck length the pattern consumes, gaps included. */
  readonly used: Millimetres;
}

/** How much demand a pattern would consume, by pile type. */
export function patternDemand(
  pattern: LanePattern,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const slot of pattern.slots) {
    counts.set(slot.pileTypeId, (counts.get(slot.pileTypeId) ?? 0) + 1);
  }
  return counts;
}

/**
 * A few orders worth laying the same piles in. Order does not change how many
 * fit, but it moves the lane's centre of mass a long way, and a full lane has
 * no slack to slide it back. Longest-first, shortest-first and
 * longest-in-the-middle span the useful range; every order is factorial.
 */
function arrangements(types: readonly PileType[]): PileType[][] {
  const descending = [...types];
  const ascending = [...types].reverse();

  const middleOut: PileType[] = [];
  for (const [index, type] of descending.entries()) {
    if (index % 2 === 0) {
      middleOut.push(type);
    } else {
      middleOut.unshift(type);
    }
  }

  const seen = new Set<string>();
  return [descending, ascending, middleOut].filter(order => {
    const key = order.map(type => type.id).join('|');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function layOut(
  types: readonly PileType[],
  start: Millimetres,
  span: Millimetres,
  options: LoadingOptions,
): LanePattern {
  let x = start;
  const slots: LaneSlot[] = [];
  let mass = 0;
  let halfWidth = 0;
  for (const type of types) {
    slots.push({pileTypeId: type.id, x, flipped: false});
    mass += type.mass;
    halfWidth = Math.max(halfWidth, maxRadius(type));
    x += type.length + options.endGap;
  }
  const used = x - start - options.endGap;
  return {slots, slack: span - used, halfWidth, mass, used};
}

/**
 * Ways of filling one lane, fullest first. Walks a sorted type list without
 * going backwards, so each multiset is generated once. Short patterns are kept
 * too: a lane with a pile missing has slack, and slack buys a stagger.
 */
export function lanePatterns(
  available: ReadonlyMap<string, number>,
  catalogue: Catalogue,
  span: Millimetres,
  start: Millimetres,
  options: LoadingOptions,
  {
    limit = 24,
    maxHalfWidth = Infinity,
  }: {limit?: number; maxHalfWidth?: Millimetres} = {},
): LanePattern[] {
  const usable = [...available]
    .filter(([, count]) => count > 0)
    .flatMap(([id]) => {
      const type = findPileType(catalogue, id);
      return type && maxRadius(type) <= maxHalfWidth ? [type] : [];
    })
    .sort((a, b) => b.length - a.length || a.id.localeCompare(b.id));

  const patterns: LanePattern[] = [];
  const chosen: PileType[] = [];
  const taken = new Map<string, number>();

  function walk(from: number, lengthUsed: Millimetres): void {
    if (chosen.length > 0) {
      for (const order of arrangements(chosen)) {
        patterns.push(layOut(order, start, span, options));
      }
    }
    if (patterns.length > limit * 8) {
      return;
    }
    for (let index = from; index < usable.length; index++) {
      const type = usable[index]!;
      const used = taken.get(type.id) ?? 0;
      if (used >= (available.get(type.id) ?? 0)) {
        continue;
      }
      const addition = type.length + (chosen.length > 0 ? options.endGap : 0);
      if (lengthUsed + addition > span) {
        continue;
      }
      chosen.push(type);
      taken.set(type.id, used + 1);
      walk(index, lengthUsed + addition);
      chosen.pop();
      taken.set(type.id, used);
    }
  }

  walk(0, 0);

  return patterns
    .sort(
      (a, b) =>
        b.slots.length - a.slots.length ||
        b.used - a.used ||
        a.halfWidth - b.halfWidth,
    )
    .slice(0, limit);
}

/**
 * The flip assignments worth trying: every combination while there are few
 * enough, then all-on, all-off and the two alternations.
 */
export function flipVariants(
  pattern: LanePattern,
  allowFlips: boolean,
): LanePattern[] {
  if (!allowFlips || pattern.slots.length === 0) {
    return [pattern];
  }

  const count = pattern.slots.length;
  const assignments: boolean[][] = [];
  if (count <= 4) {
    for (let mask = 0; mask < 1 << count; mask++) {
      assignments.push(
        Array.from({length: count}, (_, index) => (mask & (1 << index)) !== 0),
      );
    }
  } else {
    assignments.push(
      Array.from({length: count}, () => false),
      Array.from({length: count}, () => true),
      Array.from({length: count}, (_, index) => index % 2 === 0),
      Array.from({length: count}, (_, index) => index % 2 === 1),
    );
  }

  return assignments.map(flips => ({
    ...pattern,
    slots: pattern.slots.map((slot, index) => ({
      ...slot,
      flipped: flips[index]!,
    })),
  }));
}
