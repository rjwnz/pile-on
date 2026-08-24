import {
  MIN_BEARERS_PER_PACK,
  bearerStations,
  bearingGround,
  footprintOver,
  intersectSpans,
} from '../domain/packs';
import {maxRadius} from '../domain/pile';
import {balanceTargetOf} from '../domain/vehicle';
import type {Placement, PlacedPile} from '../domain/placement';
import {GEOMETRIC_EPSILON, type Kilograms, type Millimetres} from '../units';
import {groupBy} from '../collections';
import type {PackingOptions} from './options';
import {
  buildPackCandidates,
  invertedPack,
  packFlips,
  type BuiltPack,
  type PackBuildInput,
} from './packBuilder';

/**
 * Composes one tier as rows of packs marching down the deck: each row is a
 * single pack, or two side by side — never more abreast — with `endGap`
 * between rows. The side-by-side rules live here: the pair fits inside the
 * side margins with the packs kept apart (banded bundles never interleave
 * their steel), weighs alike within `minPackMassRatio`, and above the bottom
 * tier every pack stands wholly on the footprint the tier below offers over
 * the pack's own run of deck. The head-to-tail run inside a pack carries on
 * across the join between them: the second pack of a row is turned end for
 * end when that is what puts the two facing piles the opposite way round.
 */

export interface LayerResult {
  /** Deck coordinates, `pack` stamped per pack in row order, tier still 0. */
  readonly placements: readonly PlacedPile[];
  readonly packs: number;
  readonly mass: Kilograms;
  /** Widest bounding radius aboard — steel the tier holds above its base. */
  readonly maxRadius: Millimetres;
}

const EMPTY_LAYER: LayerResult = {
  placements: [],
  packs: 0,
  mass: 0,
  maxRadius: 0,
};

export interface TierInput extends PackBuildInput {
  /**
   * Longitudinal stretches the tier below covers, or null on the deck
   * itself. A row of packs must land wholly inside one of them.
   */
  readonly support: readonly (readonly [Millimetres, Millimetres])[] | null;
  /** The tier below's placements, for the per-station footprint — null on
   * the deck itself. */
  readonly below: readonly Placement[] | null;
}

interface Row {
  readonly packs: readonly BuiltPack[];
  /** Left steel edge of each pack, before the whole row is shifted. */
  readonly offsets: readonly Millimetres[];
  readonly width: Millimetres;
  readonly length: Millimetres;
  readonly mass: Kilograms;
  readonly count: number;
  readonly identical: number;
}

/**
 * Carry the head-to-tail run across the join between packs: a pack whose
 * left-hand pile faces the same way as its neighbour's right-hand pile is
 * turned end for end, provided the turned band still bands and comes out no
 * wider. Orientation is free in the yard, so this never costs deck.
 */
function seatHeadToTail(
  packs: readonly BuiltPack[],
  options: PackingOptions,
): readonly BuiltPack[] {
  if (!options.allowFlips || packs.length < 2) {
    return packs;
  }
  const seated: BuiltPack[] = [];
  for (const pack of packs) {
    const facing = seated.at(-1);
    const trailing = facing ? packFlips(facing).at(-1) : undefined;
    if (trailing !== undefined && packFlips(pack)[0] === trailing) {
      const turned = invertedPack(pack, options);
      if (turned && turned.width <= pack.width + GEOMETRIC_EPSILON) {
        seated.push(turned);
        continue;
      }
    }
    seated.push(pack);
  }
  return seated;
}

function rowOf(unseated: readonly BuiltPack[], input: TierInput): Row {
  const packs = seatHeadToTail(unseated, input.options);
  // Packs are banded bundles lifted one at a time, so their steel never
  // interleaves the way flipped piles inside a pack do: the next pack
  // starts a clearance past the previous pack's edge, full stop.
  const gap = input.options.clearances.helixToHelix;
  const offsets: Millimetres[] = [];
  let edge = 0;
  for (const pack of packs) {
    offsets.push(edge);
    edge += pack.width + gap;
  }
  return {
    packs,
    offsets,
    width: edge - gap,
    length: Math.max(...packs.map(pack => pack.length)),
    mass: packs.reduce((total, pack) => total + pack.mass, 0),
    count: packs.reduce((total, pack) => total + pack.piles.length, 0),
    identical: packs.filter(pack => pack.identical).length,
  };
}

/**
 * Where the whole row may shift to across the deck, as intervals of the
 * shift value: inside the side margins, and with every pack wholly on the
 * footprint the tier below offers over that pack's own run of deck.
 */
function allowedShifts(
  row: Row,
  cursor: Millimetres,
  input: TierInput,
): [number, number][] {
  const halfDeck = input.vehicle.deckWidth / 2 - input.options.sideMargin;
  if (row.width > halfDeck * 2) {
    return [];
  }
  let ranges: [number, number][] = [[-halfDeck, halfDeck - row.width]];
  if (input.below) {
    for (const [index, pack] of row.packs.entries()) {
      const left = row.offsets[index]!;
      const right = left + pack.width;
      const footprint = footprintOver(
        input.below,
        input.catalogue,
        input.options,
        cursor,
        cursor + pack.length,
      );
      if (footprint === null) {
        // Nothing beneath: the support spans already forbid landing here.
        continue;
      }
      const onto = footprint
        .filter(([from, to]) => to - from >= pack.width - GEOMETRIC_EPSILON)
        .map(([from, to]): [number, number] => [from - left, to - right]);
      ranges = intersectSpans(ranges, onto);
      if (ranges.length === 0) {
        return [];
      }
    }
  }
  return ranges;
}

/** Lateral mass centring: what shift puts the row's centre on the centreline. */
function centringShift(row: Row): Millimetres {
  let moment = 0;
  let mass = 0;
  for (const [index, pack] of row.packs.entries()) {
    const offset = row.offsets[index]!;
    for (const pile of pack.piles) {
      moment += pile.type.mass * (pile.placement.y + offset);
      mass += pile.type.mass;
    }
  }
  return mass > 0 ? -moment / mass : 0;
}

/** The shift inside the allowed ranges closest to what centring wants. */
function bestShift(
  ranges: readonly (readonly [number, number])[],
  wanted: number,
): number | null {
  let best: number | null = null;
  for (const [low, high] of ranges) {
    const clamped = Math.min(Math.max(wanted, low), high);
    if (best === null || Math.abs(clamped - wanted) < Math.abs(best - wanted)) {
      best = clamped;
    }
  }
  return best;
}

/**
 * How good a row is, best first: most piles aboard, then the most identical
 * bundles, then the shorter run of deck, then the narrower band, then the
 * truest centring. Compared term by term, smaller wins.
 */
function rowRank(row: Row, miss: number): number[] {
  return [-row.count, -row.identical, row.length, row.width, miss];
}

function outranks(a: readonly number[], b: readonly number[]): boolean {
  for (const [index, value] of a.entries()) {
    if (value !== b[index]) {
      return value < b[index]!;
    }
  }
  return false;
}

/** Whether the two demands together stay within what is available. */
function demandsFit(
  a: BuiltPack,
  b: BuiltPack,
  available: ReadonlyMap<string, number>,
): boolean {
  const combined = new Map(a.demand);
  for (const [id, count] of b.demand) {
    combined.set(id, (combined.get(id) ?? 0) + count);
  }
  for (const [id, count] of combined) {
    if (count > (available.get(id) ?? 0)) {
      return false;
    }
  }
  return true;
}

/** Every ordering of up to this many rows is tried; past it the sweep order
 * stands. 6! = 720 candidate chains, each scored by arithmetic alone. */
const ROW_ORDERS_TRIED = 6;

function permutations(count: number): number[][] {
  const out: number[][] = [];
  const walk = (chosen: number[], left: number[]) => {
    if (left.length === 0) {
      out.push([...chosen]);
      return;
    }
    for (const [index, next] of left.entries()) {
      chosen.push(next);
      walk(chosen, [...left.slice(0, index), ...left.slice(index + 1)]);
      chosen.pop();
    }
  };
  walk(
    [],
    Array.from({length: count}, (_, index) => index),
  );
  return out;
}

/**
 * Re-lay a stretch's rows in whichever order and position puts their weight
 * on the balance point. Returns the placements to use, or null to keep the
 * chain exactly as swept.
 */
function arrangeRows(
  rows: readonly {piles: readonly PlacedPile[]; length: Millimetres}[],
  chainStart: Millimetres,
  spanEnd: Millimetres,
  input: TierInput,
): PlacedPile[] | null {
  if (rows.length === 0) {
    return null;
  }
  const target = balanceTargetOf(input.vehicle);
  const gap = input.options.endGap;

  const stats = rows.map(row => {
    let mass = 0;
    let moment = 0;
    for (const pile of row.piles) {
      mass += pile.type.mass;
      moment += pile.type.mass * (pile.type.length / 2);
    }
    return {mass, offset: mass > 0 ? moment / mass : 0};
  });
  const chainLength =
    rows.reduce((total, row) => total + row.length, 0) +
    gap * (rows.length - 1);
  const slack = Math.max(0, spanEnd - chainStart - chainLength);

  const orders =
    rows.length <= ROW_ORDERS_TRIED
      ? permutations(rows.length)
      : [rows.map((_, index) => index)];

  const widths = rows.map(row => {
    let left = Infinity;
    let right = -Infinity;
    for (const pile of row.piles) {
      left = Math.min(left, pile.placement.y - maxRadius(pile.type));
      right = Math.max(right, pile.placement.y + maxRadius(pile.type));
    }
    return left <= right ? right - left : 0;
  });
  const widest = Math.max(...widths);
  const chainMid = chainStart + chainLength / 2;

  const candidates = orders.map(order => {
    let cursor = chainStart;
    let mass = 0;
    let moment = 0;
    let narrowness = 0;
    const starts = new Map<number, Millimetres>();
    for (const index of order) {
      starts.set(index, cursor);
      mass += stats[index]!.mass;
      moment += stats[index]!.mass * (cursor + stats[index]!.offset);
      // How much narrow-row sits near the middle of the chain: 0 when every
      // narrow row is at an end, biggest when the narrowest row is central.
      const centre = cursor + rows[index]!.length / 2;
      const centrality =
        chainLength > 0
          ? Math.max(0, 1 - Math.abs(centre - chainMid) / (chainLength / 2))
          : 0;
      narrowness += (widest - widths[index]!) * centrality;
      cursor += rows[index]!.length + gap;
    }
    const centroid = mass > 0 ? moment / mass : target;
    const slide = Math.min(Math.max(target - centroid, 0), slack);
    return {
      starts,
      slide,
      miss: Math.abs(centroid + slide - target),
      narrowness,
    };
  });
  // Best balance first; at equal balance, prefer narrow rows at the chain
  // ends — a narrow row mid-chain pinches the footprint the tiers above
  // must stand on, for nothing in return.
  candidates.sort((a, b) => a.miss - b.miss || a.narrowness - b.narrowness);

  for (const candidate of candidates) {
    const laid = rows.flatMap((row, index) =>
      row.piles.map(pile => ({
        ...pile,
        placement: {
          ...pile.placement,
          x: candidate.starts.get(index)! + candidate.slide,
        },
      })),
    );
    if (!chainContained(laid, input)) {
      continue;
    }
    // With the weight on the balance point along the deck, cancel what the
    // rows carry across it: each row may mirror about the centreline for
    // free, so pick the signs that best cancel — greedily, heaviest moment
    // first, exactly as tiers mirror against each other.
    const mirrored = mirrorRows(laid);
    return chainContained(mirrored, input) ? mirrored : laid;
  }
  return null;
}

/** Flip whole rows across the centreline until their moments best cancel. */
function mirrorRows(chain: readonly PlacedPile[]): PlacedPile[] {
  const byStart = groupBy(chain, pile => pile.placement.x);
  const rows = [...byStart.values()].map(piles => ({
    piles,
    moment: piles.reduce(
      (total, pile) => total + pile.type.mass * pile.placement.y,
      0,
    ),
  }));
  rows.sort((a, b) => Math.abs(b.moment) - Math.abs(a.moment));

  let carried = 0;
  const out: PlacedPile[] = [];
  for (const row of rows) {
    const mirror =
      Math.abs(carried + row.moment) <= Math.abs(carried - row.moment) ? 1 : -1;
    carried += row.moment * mirror;
    out.push(
      ...row.piles.map(pile =>
        mirror === 1
          ? pile
          : {...pile, placement: {...pile.placement, y: -pile.placement.y}},
      ),
    );
  }
  return out;
}

/**
 * Whether every pack of a shifted chain still stands on its footprint, and
 * can be borne there — a pack needs two timbers under it, and above the
 * bottom tier they have to land on the shaft the tier below presents.
 */
function chainContained(
  chain: readonly PlacedPile[],
  input: TierInput,
): boolean {
  if (!input.below) {
    return true;
  }
  const ground = bearingGround(input.below, input.catalogue);
  for (const piles of groupBy(chain, pile => pile.placement.pack).values()) {
    // A pack has to be bearable where it lands, not merely over something:
    // two timbers, each on shaft the tier below actually presents.
    if (bearerStations(piles, ground).length < MIN_BEARERS_PER_PACK) {
      return false;
    }
    const x0 = Math.min(...piles.map(pile => pile.placement.x));
    const x1 = Math.max(
      ...piles.map(pile => pile.placement.x + pile.type.length),
    );
    const left = Math.min(
      ...piles.map(pile => pile.placement.y - maxRadius(pile.type)),
    );
    const right = Math.max(
      ...piles.map(pile => pile.placement.y + maxRadius(pile.type)),
    );
    const footprint = footprintOver(
      input.below,
      input.catalogue,
      input.options,
      x0,
      x1,
    );
    if (footprint === null) {
      continue;
    }
    const held = footprint.some(
      ([from, to]) =>
        left >= from - GEOMETRIC_EPSILON && right <= to + GEOMETRIC_EPSILON,
    );
    if (!held) {
      return false;
    }
  }
  return true;
}

/** Stamp deck coordinates and a pack index onto a chosen row. */
function placed(
  row: Row,
  cursor: Millimetres,
  shift: number,
  firstPack: number,
): PlacedPile[] {
  return row.packs.flatMap((pack, index) =>
    pack.piles.map(pile => ({
      ...pile,
      placement: {
        ...pile.placement,
        pack: firstPack + index,
        x: cursor,
        y: pile.placement.y + row.offsets[index]! + shift,
      },
    })),
  );
}

/**
 * The best tier the demand can field: rows swept along each supported
 * stretch of deck, each row the best available — most piles aboard, then
 * the most identical bundles, then the shorter run of deck, then the
 * narrower band. Weight balance between a pair is a hard rule here, exactly
 * as the validator checks it.
 */
export function packTier(input: TierInput): LayerResult {
  const available = new Map(input.available);
  let massLeft = input.massBudget;

  const spans: readonly (readonly [Millimetres, Millimetres])[] =
    input.support ?? [[input.options.headboardGap, input.vehicle.deckLength]];

  const placements: PlacedPile[] = [];
  let packCount = 0;
  let mass = 0;

  for (const [spanStart, spanEnd] of spans) {
    const chainStart = Math.max(spanStart, input.options.headboardGap);
    let cursor = chainStart;
    const spanFirst = placements.length;
    const spanRows: {piles: PlacedPile[]; length: Millimetres}[] = [];

    for (;;) {
      const room = spanEnd - cursor;
      if (room <= 0) {
        break;
      }
      const candidates = buildPackCandidates({
        ...input,
        available,
        massBudget: massLeft,
      }).filter(pack => pack.length <= room + GEOMETRIC_EPSILON);

      let best: {row: Row; shift: number; rank: number[]} | null = null;
      const consider = (packs: readonly BuiltPack[]) => {
        const row = rowOf(packs, input);
        if (row.mass > massLeft) {
          return;
        }
        const ranges = allowedShifts(row, cursor, input);
        if (ranges.length === 0) {
          return;
        }
        const wanted = centringShift(row);
        const shift = bestShift(ranges, wanted);
        if (shift === null) {
          return;
        }
        const rank = rowRank(row, Math.abs(shift - wanted));
        if (!best || outranks(rank, best.rank)) {
          best = {row, shift, rank};
        }
      };

      for (const single of candidates) {
        consider([single]);
      }
      const ratio = input.options.minPackMassRatio;
      for (const [index, left] of candidates.entries()) {
        for (const right of candidates.slice(index)) {
          if (!demandsFit(left, right, available)) {
            continue;
          }
          const lighter = Math.min(left.mass, right.mass);
          const heavier = Math.max(left.mass, right.mass);
          if (ratio > 0 && lighter + GEOMETRIC_EPSILON < ratio * heavier) {
            continue;
          }
          consider([left, right]);
          if (left !== right) {
            consider([right, left]);
          }
        }
      }

      if (!best) {
        break;
      }
      const chosen: {row: Row; shift: number} = best;

      const laidRow = placed(chosen.row, cursor, chosen.shift, packCount);
      placements.push(...laidRow);
      spanRows.push({piles: laidRow, length: chosen.row.length});
      packCount += chosen.row.packs.length;
      mass += chosen.row.mass;
      massLeft -= chosen.row.mass;
      for (const pack of chosen.row.packs) {
        for (const [id, count] of pack.demand) {
          available.set(id, (available.get(id) ?? 0) - count);
        }
      }
      cursor += chosen.row.length + input.options.endGap;
    }

    /*
     * The sweep fills best-row-first from the front of the stretch, which
     * parks the runt row at the rear and any spare deck behind it — a bias
     * no later whole-tier slide can undo once the chain fills the stretch.
     * The rows themselves are movable bundles, though: choose the order
     * along the stretch, and the slide within it, that put the chain's
     * weight on the balance point — verified against the footprint below
     * like any other move, best arrangement first.
     */
    const arranged = arrangeRows(spanRows, chainStart, spanEnd, input);
    if (arranged) {
      placements.splice(spanFirst, placements.length - spanFirst, ...arranged);
    }
  }

  if (placements.length === 0) {
    return EMPTY_LAYER;
  }
  return {
    placements,
    packs: packCount,
    mass,
    maxRadius: placements.reduce(
      (widest, pile) => Math.max(widest, maxRadius(pile.type)),
      0,
    ),
  };
}
