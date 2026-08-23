import {groupBy} from '../collections';
import type {Catalogue} from '../domain/catalogue';
import {findPileType} from '../domain/catalogue';
import {maxRadius, type PileType} from '../domain/pile';
import type {PlacedPile, Placement} from '../domain/placement';
import {balanceTargetOf, type Vehicle} from '../domain/vehicle';
import {requiredLateralSeparation} from '../geometry/separation';
import {GEOMETRIC_EPSILON, type Kilograms, type Millimetres} from '../units';
import {
  flipVariants,
  lanePatterns,
  patternDemand,
  type LanePattern,
} from './lane';
import type {PackingOptions} from './options';
import {helixIntervals, staggerOffsets, type Interval} from './stagger';

/** A pile placed in a tier, before it knows which truck or tier it is in. */
export interface TierPlacement {
  readonly pileTypeId: string;
  readonly x: Millimetres;
  readonly y: Millimetres;
  readonly flipped: boolean;
}

export interface TierResult {
  readonly placements: readonly TierPlacement[];
  /** Widest radius in the tier — what it costs in height. */
  readonly halfWidth: Millimetres;
  readonly mass: Kilograms;
}

export interface TierInput {
  readonly available: ReadonlyMap<string, number>;
  readonly catalogue: Catalogue;
  readonly vehicle: Vehicle;
  readonly options: PackingOptions;
  /** No pile wider than this, so the tier's height is settled before it starts. */
  readonly maxHalfWidth: Millimetres;
  /** Payload left for piles in this tier. */
  readonly massBudget: Kilograms;
  /**
   * Longitudinal stretches the tier below covers, or null on the deck itself.
   * A pile must land wholly inside one of them or it is resting on air.
   */
  readonly support: readonly (readonly [Millimetres, Millimetres])[] | null;
}

/**
 * Height difference between two axes sharing a tier: each pile rests on its
 * widest point, so the offset is just the difference in widest radius.
 */
function verticalOffset(a: PileType, b: PileType): Millimetres {
  return maxRadius(a) - maxRadius(b);
}

/** Piles of a pattern, slid along the deck and dropped in a lane. */
function placeLane(
  pattern: LanePattern,
  offset: Millimetres,
  y: Millimetres,
  catalogue: Catalogue,
): PlacedPile[] {
  return pattern.slots.flatMap<PlacedPile>((slot, index) => {
    const type = findPileType(catalogue, slot.pileTypeId);
    if (!type) {
      return [];
    }
    const placement: Placement = {
      id: `lane-${index}`,
      consignmentId: '',
      deck: 'truck',
      pileTypeId: slot.pileTypeId,
      tier: 0,
      x: slot.x + offset,
      y,
      flipped: slot.flipped,
    };
    return [{type, placement}];
  });
}

/** The smallest y this lane may sit at, clear of everything already placed. */
function clearingY(
  own: readonly PlacedPile[],
  placed: readonly PlacedPile[],
  floor: Millimetres,
  options: PackingOptions,
): Millimetres {
  let y = floor;
  for (const neighbour of placed) {
    for (const mine of own) {
      const gap = requiredLateralSeparation(
        mine,
        neighbour,
        options,
        verticalOffset(mine.type, neighbour.type),
      );
      y = Math.max(y, neighbour.placement.y + gap);
    }
  }
  return y;
}

interface SweepState {
  readonly placed: readonly PlacedPile[];
  readonly remaining: ReadonlyMap<string, number>;
  readonly mass: Kilograms;
  /** Furthest right any steel reaches. Where the next lane starts looking. */
  readonly rightReach: Millimetres;
  readonly halfWidth: Millimetres;
  readonly closed: boolean;
}

interface Candidate {
  readonly own: readonly PlacedPile[];
  readonly pattern: LanePattern;
  readonly y: Millimetres;
  /** Deck width the lane consumes. Cheap lanes leave room for more of them. */
  readonly cost: Millimetres;
  /** How far this lane's own centre of mass lands from the balance point. */
  readonly balanceMiss: Millimetres;
}

/** Mass-weighted centre of a laid-out lane, along the deck. */
function laneCentre(own: readonly PlacedPile[]): Millimetres {
  let moment = 0;
  let mass = 0;
  for (const pile of own) {
    moment += pile.type.mass * (pile.placement.x + pile.type.length / 2);
    mass += pile.type.mass;
  }
  return mass > 0 ? moment / mass : 0;
}

/** How many candidates survive each narrowing, chosen to keep the sweep quick. */
const SHORTLIST = 10;
const OFFSETS_TRIED = 16;

/**
 * Thin a sorted offset list without losing its ends.
 *
 * Taking the front of it would quietly drop the far end of the travel, which is
 * often the only offset that clears a neighbour's last plate.
 */
function trim(offsets: readonly Millimetres[], keep: number): Millimetres[] {
  if (offsets.length <= keep) {
    return [...offsets];
  }
  const step = (offsets.length - 1) / (keep - 1);
  const thinned = new Set<Millimetres>();
  for (let index = 0; index < keep; index++) {
    thinned.add(offsets[Math.round(index * step)]!);
  }
  return [...thinned];
}

function spansCovered(
  own: readonly PlacedPile[],
  support: TierInput['support'],
): boolean {
  if (!support) {
    return true;
  }
  return own.every(pile =>
    support.some(
      ([start, end]) =>
        pile.placement.x >= start - GEOMETRIC_EPSILON &&
        pile.placement.x + pile.type.length <= end + GEOMETRIC_EPSILON,
    ),
  );
}

function candidatesFor(state: SweepState, input: TierInput): Candidate[] {
  const {catalogue, vehicle, options, massBudget, maxHalfWidth} = input;
  const halfDeck = vehicle.deckWidth / 2 - options.sideMargin;
  const start = options.headboardGap;
  const span = vehicle.deckLength - start;

  const patterns = lanePatterns(
    state.remaining,
    catalogue,
    span,
    start,
    options,
    {limit: options.maxLanePatterns, maxHalfWidth},
  ).slice(0, 6);

  const neighbourPlates: Interval[] = helixIntervals(state.placed);

  // Two passes: score cheaply against the last lane (which nearly always
  // binds), then measure only the shortlist against the whole tier.
  const lastLaneY = state.placed.reduce(
    (highest, pile) => Math.max(highest, pile.placement.y),
    -Infinity,
  );
  const lastLane = state.placed.filter(pile => pile.placement.y === lastLaneY);

  const target = balanceTargetOf(vehicle);
  const rough: {
    own: PlacedPile[];
    pattern: LanePattern;
    y: number;
    balanceMiss: number;
  }[] = [];
  for (const pattern of patterns) {
    if (state.mass + pattern.mass > massBudget) {
      continue;
    }
    for (const variant of flipVariants(pattern, options.allowFlips).slice(
      0,
      8,
    )) {
      const zeroOffset = placeLane(variant, 0, 0, catalogue);
      const offsets = trim(
        staggerOffsets(
          helixIntervals(zeroOffset),
          neighbourPlates,
          variant.slack,
        ),
        OFFSETS_TRIED,
      );

      // One extra offset staggering would never propose: centre this lane's
      // mass on the balance point. A part-full lane has metres of slack that
      // stagger equally well, and without this it sits at the headboard and
      // drags the truck forward in a way nothing later can undo.
      const centring = target - laneCentre(zeroOffset);
      offsets.push(Math.min(Math.max(centring, 0), variant.slack));

      for (const offset of new Set(offsets)) {
        const own = placeLane(variant, offset, 0, catalogue);
        if (!spansCovered(own, input.support)) {
          continue;
        }
        const floor = -halfDeck + variant.halfWidth;
        const y = clearingY(own, lastLane, floor, options);
        rough.push({
          own,
          pattern: variant,
          y,
          balanceMiss: Math.abs(laneCentre(own) - target),
        });
      }
    }
  }

  /*
   * Shortlisted per width class, not overall: narrow lanes always land closer
   * in, so a single shortlist would cut every wide lane before scoring sees it.
   */
  const byClass = groupBy(rough, entry => entry.pattern.halfWidth);
  const shortlist = [...byClass.values()].flatMap(group =>
    group
      .sort(
        (a, b) =>
          a.y - b.y ||
          b.pattern.slots.length - a.pattern.slots.length ||
          a.balanceMiss - b.balanceMiss,
      )
      .slice(0, SHORTLIST),
  );

  const candidates: Candidate[] = [];
  for (const entry of shortlist) {
    const floor = -halfDeck + entry.pattern.halfWidth;
    const y = clearingY(entry.own, state.placed, floor, options);
    if (y + entry.pattern.halfWidth > halfDeck + GEOMETRIC_EPSILON) {
      continue;
    }
    candidates.push({
      own: entry.own.map(pile => ({
        ...pile,
        placement: {...pile.placement, y},
      })),
      pattern: entry.pattern,
      y,
      cost: Math.max(
        y + entry.pattern.halfWidth - state.rightReach,
        GEOMETRIC_EPSILON,
      ),
      balanceMiss: entry.balanceMiss,
    });
  }

  /*
   * Widest first, then densest. Density alone fills every tier with narrow
   * lanes and defers the wide piles — the scarce resource — to a later truck,
   * which regularly costs one.
   */
  const widest = Math.max(...candidates.map(entry => entry.pattern.halfWidth));
  const rank = (entry: Candidate) =>
    entry.pattern.halfWidth >= widest ? 1 : 0;

  return candidates.sort(
    (a, b) =>
      rank(b) - rank(a) ||
      b.pattern.slots.length / b.cost - a.pattern.slots.length / a.cost ||
      b.pattern.slots.length - a.pattern.slots.length ||
      a.balanceMiss - b.balanceMiss,
  );
}

function apply(state: SweepState, candidate: Candidate): SweepState {
  const remaining = new Map(state.remaining);
  for (const [id, count] of patternDemand(candidate.pattern)) {
    remaining.set(id, (remaining.get(id) ?? 0) - count);
  }
  return {
    placed: [...state.placed, ...candidate.own],
    remaining,
    mass: state.mass + candidate.pattern.mass,
    rightReach: candidate.y + candidate.pattern.halfWidth,
    halfWidth: Math.max(state.halfWidth, candidate.pattern.halfWidth),
    closed: false,
  };
}

/**
 * Fill one tier, sweeping lanes across the deck. Each step picks a lane and
 * drops it at the leftmost y that clears everything already down; offsets are
 * exact, not sampled. A beam of part-built tiers is carried because the
 * densest lane now sometimes strands a strip a worse lane would have kept
 * usable.
 */
export function packTier(input: TierInput): TierResult {
  const {options, vehicle} = input;
  const halfDeck = vehicle.deckWidth / 2 - options.sideMargin;

  let beam: SweepState[] = [
    {
      placed: [],
      remaining: input.available,
      mass: 0,
      rightReach: -halfDeck,
      halfWidth: 0,
      closed: false,
    },
  ];

  while (beam.some(state => !state.closed)) {
    const next: SweepState[] = [];
    for (const state of beam) {
      if (state.closed) {
        next.push(state);
        continue;
      }
      const candidates = candidatesFor(state, input).slice(
        0,
        options.beamWidth,
      );
      if (candidates.length === 0) {
        next.push({...state, closed: true});
        continue;
      }
      for (const candidate of candidates) {
        next.push(apply(state, candidate));
      }
    }
    next.sort(
      (a, b) =>
        b.placed.length - a.placed.length || a.rightReach - b.rightReach,
    );
    beam = next.slice(0, Math.max(1, options.beamWidth));
  }

  return centred(beam[0]!, halfDeck);
}

/** Clamp, tolerating an empty range by preferring the lower bound. */
function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

/**
 * Slide the finished tier across the deck onto the centreline — by mass, not
 * extent, clamped to the side margins. Moving the whole tier keeps every
 * relative position, so no separation or stagger can be disturbed.
 */
function centred(state: SweepState, halfDeck: Millimetres): TierResult {
  if (state.placed.length === 0) {
    return {placements: [], halfWidth: 0, mass: 0};
  }

  let left = Infinity;
  let right = -Infinity;
  let moment = 0;
  let mass = 0;
  for (const pile of state.placed) {
    const reach = maxRadius(pile.type);
    left = Math.min(left, pile.placement.y - reach);
    right = Math.max(right, pile.placement.y + reach);
    moment += pile.type.mass * pile.placement.y;
    mass += pile.type.mass;
  }

  const across = clamp(-moment / mass, -halfDeck - left, halfDeck - right);

  return {
    placements: state.placed.map(pile => ({
      pileTypeId: pile.placement.pileTypeId,
      x: pile.placement.x,
      y: pile.placement.y + across,
      flipped: pile.placement.flipped,
    })),
    halfWidth: state.halfWidth,
    mass,
  };
}
