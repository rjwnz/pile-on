import type {Catalogue} from '../domain/catalogue';
import {findPileType} from '../domain/catalogue';
import {
  MIN_BEARERS_PER_PACK,
  PACK_MAX_WIDTH,
  bearerStations,
  dunnageForProtrusion,
  shaftProtrusion,
} from '../domain/packs';
import {
  maxRadius,
  pilePartOf,
  pileTypeCode,
  type PileType,
} from '../domain/pile';
import type {PlacedPile, Placement} from '../domain/placement';
import type {Vehicle} from '../domain/vehicle';
import {requiredLateralSeparation} from '../geometry/separation';
import {GEOMETRIC_EPSILON, type Kilograms, type Millimetres} from '../units';
import type {PackingOptions} from './options';

/**
 * Builds candidate packs: banded bundles of piles laid *side by side*, flush
 * at the leading end — never end to end; whole packs queue along the deck
 * instead. A pack holds one pile type code, at most `PACK_MAX_WIDTH` across;
 * starters never share a pack with extensions, and extensions of one code
 * only mix lengths when banding them apart would strand piles.
 *
 * Within a pack, flipping is the one stagger lever left: alternate piles
 * loaded tip-first put their plates at the other end, and the pack closes
 * from plate pitch to shaft pitch. Head to tail is therefore the default
 * band — bands that come out the same width are settled in its favour.
 */

/** A candidate pack, laid out in pack-local coordinates. */
export interface BuiltPack {
  /** Piles flush at x = 0, `y` measured from the pack's left steel edge. */
  readonly piles: readonly PlacedPile[];
  /** Banded width, left steel edge to right steel edge. */
  readonly width: Millimetres;
  /** Length of the longest pile — the run of deck the pack costs. */
  readonly length: Millimetres;
  readonly mass: Kilograms;
  /** Shared pile-type code — every pile in the pack carries it. */
  readonly code: string;
  /** All one component (code, part and length), what the yard prefers. */
  readonly identical: boolean;
  /** Widest bounding radius aboard. */
  readonly maxRadius: Millimetres;
  /** Widest shaft radius — the pack's shaft-top contribution. */
  readonly maxShaftRadius: Millimetres;
  /** How much demand the pack consumes, by pile type id. */
  readonly demand: ReadonlyMap<string, number>;
}

export interface PackBuildInput {
  readonly available: ReadonlyMap<string, number>;
  readonly catalogue: Catalogue;
  readonly vehicle: Vehicle;
  readonly options: PackingOptions;
  /** Height left above the shafts already stacked — a pile whose own tier
   * cannot fit inside it never boards. */
  readonly headroom: Millimetres;
  readonly massBudget: Kilograms;
}

/**
 * Height difference between two axes sharing a tier: each pile seats its
 * shaft on the bearers, so the offset is the difference in shaft radius.
 */
function verticalOffset(a: PileType, b: PileType): Millimetres {
  return a.shaftRadius - b.shaftRadius;
}

/** The flip assignments worth trying: every combination while there are few
 * enough piles, then all-one-way and the two alternations. */
export function flipPatterns(count: number, allowFlips: boolean): boolean[][] {
  if (!allowFlips || count === 0) {
    return [Array.from({length: count}, () => false)];
  }
  if (count <= 4) {
    const all: boolean[][] = [];
    for (let mask = 0; mask < 1 << count; mask++) {
      all.push(
        Array.from({length: count}, (_, index) => (mask & (1 << index)) !== 0),
      );
    }
    return all;
  }
  return [
    Array.from({length: count}, () => false),
    Array.from({length: count}, () => true),
    Array.from({length: count}, (_, index) => index % 2 === 0),
    Array.from({length: count}, (_, index) => index % 2 === 1),
  ];
}

/** One pile of a pack, flush at x = 0, before its lane across is known. */
function pileAt(
  type: PileType,
  y: Millimetres,
  flipped: boolean,
  index: number,
): PlacedPile {
  const placement: Placement = {
    id: `pack-${index}`,
    consignmentId: '',
    deck: 'truck',
    pileTypeId: type.id,
    tier: 0,
    pack: 0,
    x: 0,
    y,
    flipped,
  };
  return {type, placement};
}

/**
 * Lay the given piles side by side, flush at the leading end, each at the
 * smallest y clearing everything before it. Null when the band would come
 * out wider than a pack may be.
 */
function buildFlushPack(
  types: readonly PileType[],
  flips: readonly boolean[],
  options: PackingOptions,
): BuiltPack | null {
  const piles: PlacedPile[] = [];
  for (const [index, type] of types.entries()) {
    let y = maxRadius(type);
    for (const neighbour of piles) {
      const gap = requiredLateralSeparation(
        pileAt(type, 0, flips[index]!, index),
        neighbour,
        options,
        verticalOffset(type, neighbour.type),
      );
      y = Math.max(y, neighbour.placement.y + gap);
    }
    if (y + maxRadius(type) > PACK_MAX_WIDTH + GEOMETRIC_EPSILON) {
      return null;
    }
    piles.push(pileAt(type, y, flips[index]!, index));
  }
  if (piles.length === 0) {
    return null;
  }
  /*
   * A band the yard cannot get two timbers under is not a band. The deck is
   * continuous ground, so this is the pack's own geometry talking: its plates
   * against its shortest pile. Flipping moves the plates, so a pattern that
   * blocks the timbers is simply not the pattern chosen.
   */
  if (bearerStations(piles, null).length < MIN_BEARERS_PER_PACK) {
    return null;
  }

  let left = Infinity;
  let right = -Infinity;
  const demand = new Map<string, number>();
  const ids = new Set<string>();
  for (const pile of piles) {
    left = Math.min(left, pile.placement.y - maxRadius(pile.type));
    right = Math.max(right, pile.placement.y + maxRadius(pile.type));
    demand.set(pile.type.id, (demand.get(pile.type.id) ?? 0) + 1);
    ids.add(pile.type.id);
  }
  return {
    piles: piles.map(pile => ({
      ...pile,
      placement: {...pile.placement, y: pile.placement.y - left},
    })),
    width: right - left,
    length: Math.max(...piles.map(pile => pile.type.length)),
    mass: piles.reduce((total, pile) => total + pile.type.mass, 0),
    code: pileTypeCode(piles[0]!.type),
    identical: ids.size === 1,
    maxRadius: Math.max(...piles.map(pile => maxRadius(pile.type))),
    maxShaftRadius: Math.max(...piles.map(pile => pile.type.shaftRadius)),
    demand,
  };
}

/** How many neighbouring piles in a band lie head to tail. */
function headToTailJoins(flips: readonly boolean[]): number {
  let joins = 0;
  for (let index = 1; index < flips.length; index++) {
    if (flips[index] !== flips[index - 1]) {
      joins++;
    }
  }
  return joins;
}

/** Which way each pile of a built pack faces, left steel edge to right. */
export function packFlips(pack: BuiltPack): boolean[] {
  return pack.piles.map(pile => pile.placement.flipped);
}

/**
 * The same band turned end for end — every pile loaded the other way round,
 * so it lies head to tail against whatever it is parked beside. Null when
 * the turned band will not close inside the width limit.
 */
export function invertedPack(
  pack: BuiltPack,
  options: PackingOptions,
): BuiltPack | null {
  return buildFlushPack(
    pack.piles.map(pile => pile.type),
    packFlips(pack).map(flipped => !flipped),
    options,
  );
}

/**
 * The narrowest flush pack of exactly these piles, over the flip patterns.
 * Bands of equal width tie-break to the most head-to-tail joins — that is how
 * the yard bands by default, and where plates do collide it is the pattern
 * that closes the band anyway — and then to the band whose first pile loads
 * butt-first, so an alternating band reads the same way every time.
 */
function bestPackOf(
  types: readonly PileType[],
  options: PackingOptions,
): BuiltPack | null {
  let best: {pack: BuiltPack; joins: number} | null = null;
  for (const flips of flipPatterns(types.length, options.allowFlips)) {
    const pack = buildFlushPack(types, flips, options);
    if (!pack) {
      continue;
    }
    const band = {pack, joins: headToTailJoins(flips)};
    if (!best || bandsBetter(band, best)) {
      best = band;
    }
  }
  return best?.pack ?? null;
}

/** One candidate band against the one held, by the order `bestPackOf` sets. */
function bandsBetter(
  candidate: {pack: BuiltPack; joins: number},
  held: {pack: BuiltPack; joins: number},
): boolean {
  if (candidate.pack.width < held.pack.width - GEOMETRIC_EPSILON) {
    return true;
  }
  if (candidate.pack.width > held.pack.width + GEOMETRIC_EPSILON) {
    return false;
  }
  if (candidate.joins !== held.joins) {
    return candidate.joins > held.joins;
  }
  // Equal width and equal joins: take the band that loads butt-first, so an
  // alternating band reads the same way every time.
  return (
    held.pack.piles[0]!.placement.flipped &&
    !candidate.pack.piles[0]!.placement.flipped
  );
}

/**
 * Every pack worth considering from the demand: for each pile type on its
 * own — the identical bundles the yard prefers — every pile count that fits
 * the band; and for extensions of a code stocked in several lengths, the
 * longest-first mixed bundles that mop up remainders. Piles never lie end to
 * end inside a pack, so a candidate is wholly described by its multiset and
 * its flips.
 */
export function buildPackCandidates(input: PackBuildInput): BuiltPack[] {
  const {available, catalogue, options} = input;

  const groups = new Map<string, PileType[]>();
  for (const [id, count] of available) {
    const type = count > 0 ? findPileType(catalogue, id) : undefined;
    if (!type || maxRadius(type) * 2 > PACK_MAX_WIDTH) {
      continue;
    }
    // The least height this pile's own tier can stand: bearers clearing its
    // plates, plus shaft seat, plus its widest reach above the axis.
    const leastHeight =
      dunnageForProtrusion(shaftProtrusion(type), input.options) +
      type.shaftRadius +
      maxRadius(type);
    if (leastHeight > input.headroom) {
      continue;
    }
    if (type.mass > input.massBudget) {
      continue;
    }
    const key = `${pileTypeCode(type)}::${pilePartOf(type)}`;
    const group = groups.get(key);
    if (group) {
      group.push(type);
    } else {
      groups.set(key, [type]);
    }
  }

  const packs: BuiltPack[] = [];
  const admit = (pack: BuiltPack | null): boolean => {
    if (!pack || pack.mass > input.massBudget) {
      return false;
    }
    packs.push(pack);
    return true;
  };

  for (const group of groups.values()) {
    for (const type of group) {
      const stock = available.get(type.id) ?? 0;
      for (let count = 1; count <= stock; count++) {
        if (
          !admit(
            bestPackOf(
              Array.from({length: count}, () => type),
              options,
            ),
          )
        ) {
          break;
        }
      }
    }

    if (group.length > 1) {
      // Longest first, so the mixed bundle's length is set by its first pile
      // and the shorter remainders tuck in beside it.
      const sequence = [...group]
        .sort((a, b) => b.length - a.length || a.id.localeCompare(b.id))
        .flatMap(type =>
          Array.from({length: available.get(type.id) ?? 0}, () => type),
        );
      for (let count = 2; count <= sequence.length; count++) {
        const slice = sequence.slice(0, count);
        if (new Set(slice.map(type => type.id)).size < 2) {
          continue; // identical prefix — already offered above
        }
        if (!admit(bestPackOf(slice, options))) {
          break;
        }
      }
    }
  }
  return packs;
}
