import type {Kilograms, Millimetres} from '../units';
import {GEOMETRIC_EPSILON} from '../units';
import {groupBy} from '../collections';
import {radiusProfile} from '../geometry/profile';
import {requiredAxisDistance} from '../geometry/separation';
import {findPileType, type Catalogue} from './catalogue';
import type {LoadingOptions} from './loading';
import {
  maxRadius,
  pilePartOf,
  pileTypeCode,
  type PilePart,
  type PileType,
} from './pile';
import type {PlacedPile, Placement} from './placement';

/**
 * Packs: how piles actually travel. A pack is a single-layer bundle of piles
 * of one type, banded together, at most `PACK_MAX_WIDTH` across so it can be
 * slung and stacked; a tier holds rows of packs on bearers, at most two
 * abreast at any station along the deck.
 *
 * A bearer is a length of timber laid across a pack, touching only shafts —
 * a pile seats its *shaft* on the timber, and its plates hang below and stand
 * proud above. The bearers under a tier are sized in `DUNNAGE_INCREMENT`
 * steps so the tier's own plates clear everything beneath: the deck, and
 * every plate poking up from any tier below, however far down it started.
 *
 * Where along the deck each timber lands is derived too, per pack rather
 * than per tier: a pack rides on `MIN_BEARERS_PER_PACK` timbers at least,
 * one near each end, because a bundle on a single bearer see-saws. Rows laid
 * head to tail down the deck are the case that makes this bite — timbers
 * sized to the tier would put one under each row, not two under each pack.
 *
 * Everything here is derived from the placements — pack membership is the
 * only stored fact (`Placement.pack`), so the solver, the validator and the
 * renderer read the same bearers and the same footprints by construction.
 */

/** Widest a pack may be banded, edge of steel to edge of steel. */
export const PACK_MAX_WIDTH: Millimetres = 1200;

/** Bearers come in these thickness steps. */
export const DUNNAGE_INCREMENT: Millimetres = 50;

/** The smallest increment multiple that is at least `value`. */
export function roundUpToIncrement(value: Millimetres): Millimetres {
  return (
    DUNNAGE_INCREMENT *
    Math.ceil((value - GEOMETRIC_EPSILON) / DUNNAGE_INCREMENT)
  );
}

/** One tier's placements, grouped by pack index. */
export type TierPacks = Map<number, Placement[]>;

/** Placements grouped by tier, then by pack — tiers in ascending order. */
export function layersOf(
  placements: readonly Placement[],
): Map<number, TierPacks> {
  return new Map(
    [...groupBy(placements, placement => placement.tier)]
      .sort((a, b) => a[0] - b[0])
      .map(([tier, inTier]) => [
        tier,
        groupBy(inTier, placement => placement.pack),
      ]),
  );
}

/** Everything in a tier, pack structure dropped. */
export function flattenPacks(packs: TierPacks): Placement[] {
  return [...packs.values()].flat();
}

/** One tier of a deck: its index and every placement on it. */
export interface TierLayer {
  readonly tier: number;
  readonly placements: readonly Placement[];
}

/** Placements grouped into tiers, bottom tier first. */
export function tierLayers(placements: readonly Placement[]): TierLayer[] {
  return [...groupBy(placements, placement => placement.tier)]
    .sort((a, b) => a[0] - b[0])
    .map(([tier, inTier]) => ({tier, placements: inTier}));
}

/**
 * Lateral extent of a pack, outer edge of steel on each side. Null when no
 * placement resolves to a catalogue type.
 */
export function packLateralSpan(
  pack: readonly Placement[],
  catalogue: Catalogue,
): [Millimetres, Millimetres] | null {
  let left = Infinity;
  let right = -Infinity;
  for (const placement of pack) {
    const type = findPileType(catalogue, placement.pileTypeId);
    if (!type) {
      continue;
    }
    const reach = maxRadius(type);
    left = Math.min(left, placement.y - reach);
    right = Math.max(right, placement.y + reach);
  }
  return left <= right ? [left, right] : null;
}

/** Overall banded width of a pack. Zero when nothing resolves. */
export function packWidth(
  pack: readonly Placement[],
  catalogue: Catalogue,
): Millimetres {
  const span = packLateralSpan(pack, catalogue);
  return span ? span[1] - span[0] : 0;
}

/**
 * Longitudinal extent of a pack: leading end to the end of its longest pile.
 * Null when no placement resolves to a catalogue type.
 */
export function packLongitudinalSpan(
  pack: readonly Placement[],
  catalogue: Catalogue,
): [Millimetres, Millimetres] | null {
  let start = Infinity;
  let end = -Infinity;
  for (const placement of pack) {
    const type = findPileType(catalogue, placement.pileTypeId);
    if (!type) {
      continue;
    }
    start = Math.min(start, placement.x);
    end = Math.max(end, placement.x + type.length);
  }
  return start <= end ? [start, end] : null;
}

/**
 * Merge overlapping or nearly-touching intervals into a covered span list.
 *
 * Shared by the longitudinal support rule and the packer, which builds tiers
 * against it: if either had its own idea of when bearers bridge a gap it
 * would produce loads the other rejects.
 */
export function coveredSpans(
  intervals: readonly (readonly [number, number])[],
  bridge: number,
): [number, number][] {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + bridge) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

/** Steel mass of a pack. */
export function packMass(
  pack: readonly Placement[],
  catalogue: Catalogue,
): Kilograms {
  let mass = 0;
  for (const placement of pack) {
    const type = findPileType(catalogue, placement.pileTypeId);
    if (type) {
      mass += type.mass;
    }
  }
  return mass;
}

/**
 * How far this pile's plates stand proud of its shaft. This is what the
 * bearers above have to clear: a pile lies with its shaft on the bearers, and
 * the plates reach `maxRadius − shaftRadius` higher than the shaft does.
 * Zero for a plain extension shaft.
 */
export function shaftProtrusion(type: PileType): Millimetres {
  return maxRadius(type) - type.shaftRadius;
}

/** The tallest protrusion anywhere in a tier — what its bearers must clear. */
export function layerProtrusion(
  layer: readonly Placement[],
  catalogue: Catalogue,
): Millimetres {
  let tallest = 0;
  for (const placement of layer) {
    const type = findPileType(catalogue, placement.pileTypeId);
    if (type) {
      tallest = Math.max(tallest, shaftProtrusion(type));
    }
  }
  return tallest;
}

/**
 * Bearer thickness under a layer whose own plates reach this far below its
 * shafts: the yard's standard bearer, or thicker in `DUNNAGE_INCREMENT`
 * steps so the hanging plates clear the surface beneath by `helixToShaft`.
 */
export function dunnageForProtrusion(
  protrusion: Millimetres,
  options: LoadingOptions,
): Millimetres {
  if (protrusion <= 0) {
    return options.dunnageThickness;
  }
  return roundUpToIncrement(
    Math.max(
      options.dunnageThickness,
      protrusion + options.clearances.helixToShaft,
    ),
  );
}

/** A lower tier with its resting plane settled — input to `dunnageUnder`. */
export interface SeatedLayer {
  readonly layer: readonly Placement[];
  /** Top of the layer's bearers — where its shafts rest, mm above the deck. */
  readonly base: Millimetres;
}

/** Placements resolved against the catalogue; unknown types dropped. */
function resolve(
  placements: readonly Placement[],
  catalogue: Catalogue,
): PlacedPile[] {
  return placements.flatMap<PlacedPile>(placement => {
    const type = findPileType(catalogue, placement.pileTypeId);
    return type ? [{type, placement}] : [];
  });
}

/** Widest shaft radius in a set of placements — sets the resting planes. */
function widestShaftRadius(
  placements: readonly Placement[],
  catalogue: Catalogue,
): Millimetres {
  let widest = 0;
  for (const placement of placements) {
    const type = findPileType(catalogue, placement.pileTypeId);
    if (type) {
      widest = Math.max(widest, type.shaftRadius);
    }
  }
  return widest;
}

/** Top of a seated layer's shafts — where the next bearers rest. */
function shaftTopOf(seated: SeatedLayer, catalogue: Catalogue): Millimetres {
  return seated.base + widestShaftRadius(seated.layer, catalogue) * 2;
}

/**
 * Bearer thickness under a layer, derived from the layer itself and every
 * tier already seated below it. Three lower bounds, the largest rounded up
 * to a bearer size:
 *
 *   1. the yard's standard bearer;
 *   2. the layer's own plates hang `protrusion` below its shafts and must
 *      clear the surface the bearers sit on;
 *   3. every pile below, from *any* lower tier, must clear every pile of
 *      this layer in three dimensions — the separation rule again, solved
 *      for height. Staggering already spent shows up as lateral or
 *      longitudinal distance and buys the bearers down; what stagger cannot
 *      buy, thickness must. Checked against all lower tiers, not just the
 *      one beneath, because a tall plate two tiers down can reach straight
 *      past a low middle tier.
 *
 * Pure in the placements, so the packer, the validator and the drawings all
 * derive the same bearers and a cross-tier clash cannot be stored at all —
 * thick bearers surface as load height, which `over-height` prices.
 */
export function dunnageUnder(
  layer: readonly Placement[],
  below: readonly SeatedLayer[],
  catalogue: Catalogue,
  options: LoadingOptions,
): Millimetres {
  const own = layerProtrusion(layer, catalogue);
  let need = Math.max(
    options.dunnageThickness,
    own > 0 ? own + options.clearances.helixToShaft : 0,
  );

  const last = below[below.length - 1];
  const shaftTopBelow = last ? shaftTopOf(last, catalogue) : 0;

  const seatedAbove = resolve(layer, catalogue);
  for (const seated of below) {
    for (const a of resolve(seated.layer, catalogue)) {
      const axisA = seated.base + a.type.shaftRadius;
      for (const b of seatedAbove) {
        const distance = requiredAxisDistance(a, b, options);
        if (distance <= 0) {
          continue;
        }
        const deltaY = Math.abs(a.placement.y - b.placement.y);
        if (deltaY + GEOMETRIC_EPSILON >= distance) {
          continue;
        }
        const needZ = Math.sqrt(distance * distance - deltaY * deltaY);
        // The new layer's resting plane must put pile b's axis at least
        // needZ above pile a's axis.
        need = Math.max(
          need,
          axisA + needZ - b.type.shaftRadius - shaftTopBelow,
        );
      }
    }
  }

  return roundUpToIncrement(need);
}

/** Merged level spans of the packs in `rests`, left to right. */
function mergeLevel(
  rests: readonly {
    readonly span: readonly [Millimetres, Millimetres];
    readonly top: Millimetres;
  }[],
): [Millimetres, Millimetres][] {
  const sorted = [...rests].sort((a, b) => a.span[0] - b.span[0]);
  const merged: {span: [Millimetres, Millimetres]; top: Millimetres}[] = [];
  for (const rest of sorted) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.top - rest.top) <= GEOMETRIC_EPSILON) {
      last.span = [last.span[0], Math.max(last.span[1], rest.span[1])];
    } else {
      merged.push({span: [rest.span[0], rest.span[1]], top: rest.top});
    }
  }
  return merged.map(rest => rest.span);
}

/** Pairwise intersection of two lists of closed intervals, empties dropped. */
export function intersectSpans(
  a: readonly (readonly [number, number])[],
  b: readonly (readonly [number, number])[],
): [number, number][] {
  const out: [number, number][] = [];
  for (const [aLow, aHigh] of a) {
    for (const [bLow, bHigh] of b) {
      const low = Math.max(aLow, bLow);
      const high = Math.min(aHigh, bHigh);
      if (low <= high) {
        out.push([low, high]);
      }
    }
  }
  return out;
}

/**
 * The lateral spans a pack occupying `[x0, x1]` of the deck may stand on,
 * judged at every station: at each stretch of `[x0, x1]`, the packs of the
 * tier below covering that stretch (their piles' spans merged with the same
 * bearer bridge the longitudinal support rule uses) contribute their y-spans,
 * merged where their shaft-top planes are level — a bearer can only lie flat
 * across level packs — and the result is what holds at *every* stretch.
 * A stretch with nothing under it at all contributes no constraint — a pile
 * over thin air is the longitudinal support rule's finding, not a lateral
 * one — and when no stretch of `[x0, x1]` has ground at all there is no
 * lateral verdict to give: that is `null`, distinct from `[]`, which means
 * the stretches disagree so completely that nothing can stand there.
 */
export function footprintOver(
  layerBelow: readonly Placement[],
  catalogue: Catalogue,
  options: LoadingOptions,
  x0: Millimetres,
  x1: Millimetres,
): [Millimetres, Millimetres][] | null {
  if (x1 - x0 <= GEOMETRIC_EPSILON) {
    return null;
  }
  const bridge = options.endGap + options.dunnageThickness;

  interface Rest {
    readonly xSpans: readonly (readonly [number, number])[];
    readonly span: readonly [Millimetres, Millimetres];
    readonly top: Millimetres;
  }
  const rests: Rest[] = [];
  for (const packs of layersOf(layerBelow).values()) {
    for (const pack of packs.values()) {
      const span = packLateralSpan(pack, catalogue);
      if (!span) {
        continue;
      }
      const intervals = pack.flatMap<[number, number]>(placement => {
        const type = findPileType(catalogue, placement.pileTypeId);
        return type ? [[placement.x, placement.x + type.length]] : [];
      });
      rests.push({
        xSpans: coveredSpans(intervals, bridge),
        span,
        top: widestShaftRadius(pack, catalogue) * 2,
      });
    }
  }

  const cuts = new Set<number>([x0, x1]);
  for (const rest of rests) {
    for (const [start, end] of rest.xSpans) {
      if (start > x0 && start < x1) {
        cuts.add(start);
      }
      if (end > x0 && end < x1) {
        cuts.add(end);
      }
    }
  }
  const stations = [...cuts].sort((a, b) => a - b);

  let footprint: [Millimetres, Millimetres][] | null = null;
  for (let index = 0; index + 1 < stations.length; index++) {
    const lo = stations[index]!;
    const hi = stations[index + 1]!;
    if (hi - lo <= GEOMETRIC_EPSILON) {
      continue;
    }
    const mid = (lo + hi) / 2;
    const present = rests.filter(rest =>
      rest.xSpans.some(
        ([start, end]) =>
          mid >= start - GEOMETRIC_EPSILON && mid <= end + GEOMETRIC_EPSILON,
      ),
    );
    if (present.length === 0) {
      continue;
    }
    const level = mergeLevel(present);
    footprint = footprint === null ? level : intersectSpans(footprint, level);
    if (footprint.length === 0) {
      return [];
    }
  }
  return footprint;
}

/** Heights making up one tier of a load. All in mm above the deck. */
export interface LayerHeight {
  /** Bearer thickness under this tier. */
  readonly dunnage: Millimetres;
  /** Top of this tier's bearers — where its shafts rest. */
  readonly base: Millimetres;
  /** Top of this tier's shafts — where the next bearers rest. Plates may
   * stand higher; `loadHeight` accounts for them. */
  readonly shaftTop: Millimetres;
}

/**
 * Per-tier bearer, resting plane and shaft-top plane, keyed by tier index.
 * Each tier's bearers are derived against everything already seated below
 * it, so the whole stack's heights follow from the placements alone. A pile
 * seats its shaft on the bearers; its axis sits one shaft radius above the
 * tier's base.
 */
export function layerHeights(
  placements: readonly Placement[],
  catalogue: Catalogue,
  options: LoadingOptions,
): Map<number, LayerHeight> {
  const heights = new Map<number, LayerHeight>();
  const below: SeatedLayer[] = [];
  for (const packs of layersOf(placements).values()) {
    const layer = flattenPacks(packs);
    const tier = layer[0]!.tier;
    const last = below[below.length - 1];
    const shaftTopBelow = last ? shaftTopOf(last, catalogue) : 0;
    const dunnage = dunnageUnder(layer, below, catalogue, options);
    const base = shaftTopBelow + dunnage;
    heights.set(tier, {
      dunnage,
      base,
      shaftTop: base + widestShaftRadius(layer, catalogue) * 2,
    });
    below.push({layer, base});
  }
  return heights;
}

/** A bearer timber's footprint along the deck. The yard cuts one section and
 * varies the thickness, so width is a constant and thickness is derived. */
export const BEARER_WIDTH: Millimetres = 100;

/** Where the yard would rather land a timber: this far in from the pack's
 * ends — close enough to the end to hold the bundle down, far enough in that
 * the slings and the forks have somewhere to go. */
export const BEARER_END_INSET: Millimetres = 300;

/** A bundle on one timber see-saws, so every pack rides on at least two. */
export const MIN_BEARERS_PER_PACK = 2;

/** One timber under one pack. */
export interface Bearer {
  readonly tier: number;
  /** The stored pack index within its tier. */
  readonly pack: number;
  /** Leading edge of the timber along the deck. */
  readonly x: Millimetres;
  readonly width: Millimetres;
  /** Across the deck: the timber runs the width of the pack it carries. */
  readonly span: readonly [Millimetres, Millimetres];
  readonly thickness: Millimetres;
  /** Top face — where the pack's shafts rest, mm above the deck. */
  readonly top: Millimetres;
}

/** Subtract closed intervals from closed intervals. */
function subtractSpans(
  from: readonly (readonly [Millimetres, Millimetres])[],
  cutters: readonly (readonly [Millimetres, Millimetres])[],
): [Millimetres, Millimetres][] {
  let left: [Millimetres, Millimetres][] = from.map(([a, b]) => [a, b]);
  for (const [c0, c1] of cutters) {
    const next: [Millimetres, Millimetres][] = [];
    for (const [a, b] of left) {
      if (c1 <= a + GEOMETRIC_EPSILON || c0 >= b - GEOMETRIC_EPSILON) {
        next.push([a, b]);
        continue;
      }
      if (c0 > a + GEOMETRIC_EPSILON) {
        next.push([a, Math.min(b, c0)]);
      }
      if (c1 < b - GEOMETRIC_EPSILON) {
        next.push([Math.max(a, c1), b]);
      }
    }
    left = next;
  }
  return left.filter(([a, b]) => b - a > GEOMETRIC_EPSILON);
}

/** Every stretch of deck where a pile presents a plate rather than shaft. */
function plateSpans(
  piles: readonly PlacedPile[],
): [Millimetres, Millimetres][] {
  return piles.flatMap<[Millimetres, Millimetres]>(pile =>
    radiusProfile(pile)
      .filter(segment => segment.kind === 'helix')
      .map<[Millimetres, Millimetres]>(segment => [segment.start, segment.end]),
  );
}

/**
 * What a tier offers the timbers of the tier above: the shaft it presents,
 * along the deck. Piles laid end to end are *not* bridged here — the
 * longitudinal support rule lets a pack span a small gap between rows, but a
 * 100 mm timber dropped into that gap holds nothing — and stretches where a
 * plate pokes up above the shafts are cut out, because a timber laid across
 * a plate rocks on it.
 */
export function bearingGround(
  layer: readonly Placement[],
  catalogue: Catalogue,
): [Millimetres, Millimetres][] {
  const piles = resolve(layer, catalogue);
  const shaft = coveredSpans(
    piles.map<[Millimetres, Millimetres]>(pile => [
      pile.placement.x,
      pile.placement.x + pile.type.length,
    ]),
    0,
  );
  return subtractSpans(shaft, plateSpans(piles));
}

/**
 * Where a timber may land under these piles, as intervals of its *leading*
 * edge. Three conditions, and all of them are about touching shaft:
 *
 *   1. inside every pile of the pack — a timber past the end of the shortest
 *      pile carries the rest of the pack and lets that one hang;
 *   2. clear of every plate in the pack, which hangs below the shafts and
 *      would take the whole load on its edge;
 *   3. on ground that will hold it: the deck (`ground` null, which is
 *      continuous), or the shaft the tier below presents.
 */
function bearerWindows(
  piles: readonly PlacedPile[],
  ground: readonly (readonly [Millimetres, Millimetres])[] | null,
): [Millimetres, Millimetres][] {
  if (piles.length === 0) {
    return [];
  }
  const start = Math.max(...piles.map(pile => pile.placement.x));
  const end = Math.min(
    ...piles.map(pile => pile.placement.x + pile.type.length),
  );
  if (end - start < BEARER_WIDTH - GEOMETRIC_EPSILON) {
    return [];
  }

  const seat: [Millimetres, Millimetres][] = ground
    ? ground.flatMap<[Millimetres, Millimetres]>(([low, high]) => {
        const lo = Math.max(low, start);
        const hi = Math.min(high, end);
        return hi > lo ? [[lo, hi]] : [];
      })
    : [[start, end]];

  return subtractSpans(seat, plateSpans(piles))
    .map<[Millimetres, Millimetres]>(([low, high]) => [
      low,
      high - BEARER_WIDTH,
    ])
    .filter(([low, high]) => high >= low - GEOMETRIC_EPSILON);
}

/**
 * The feasible station nearest `target`, or null when there is none. A plate
 * sitting on the preferred station leaves a choice of walking the timber
 * inward or outward by the same distance; `inward` says which of those is
 * toward the middle of the pack, and the yard walks inward — a timber nearer
 * the end holds less of the bundle down.
 */
function nearestStation(
  windows: readonly (readonly [Millimetres, Millimetres])[],
  target: Millimetres,
  inward: 'higher' | 'lower',
): Millimetres | null {
  let best: Millimetres | null = null;
  let bestGap = Infinity;
  for (const [low, high] of windows) {
    const clamped = Math.min(Math.max(target, low), high);
    const gap = Math.abs(clamped - target);
    const tied = Math.abs(gap - bestGap) <= GEOMETRIC_EPSILON;
    const better = tied
      ? best !== null && (inward === 'higher' ? clamped > best : clamped < best)
      : gap < bestGap;
    if (better || best === null) {
      best = clamped;
      bestGap = Math.min(gap, bestGap);
    }
  }
  return best;
}

/**
 * Where the timbers under a pack land, front to rear.
 *
 * One near each end, walked inward off any plate or off any gap in the ground
 * beneath, and if the inset pair collapses onto one timber the extreme
 * feasible pair is tried before giving up. Fewer than
 * `MIN_BEARERS_PER_PACK` stations back means this pack cannot be borne where
 * it stands — the packer refuses to build it and the validator says so.
 */
export function bearerStations(
  piles: readonly PlacedPile[],
  ground: readonly (readonly [Millimetres, Millimetres])[] | null,
): Millimetres[] {
  const windows = bearerWindows(piles, ground);
  if (windows.length === 0) {
    return [];
  }
  const start = Math.max(...piles.map(pile => pile.placement.x));
  const end = Math.min(
    ...piles.map(pile => pile.placement.x + pile.type.length),
  );

  const apart = (a: Millimetres, b: Millimetres) =>
    b - a >= BEARER_WIDTH - GEOMETRIC_EPSILON;

  const front = nearestStation(windows, start + BEARER_END_INSET, 'higher');
  const rear = nearestStation(
    windows,
    end - BEARER_END_INSET - BEARER_WIDTH,
    'lower',
  );
  if (front === null || rear === null) {
    return [];
  }
  const [low, high] = [Math.min(front, rear), Math.max(front, rear)];
  if (apart(low, high)) {
    return [low, high];
  }

  // The inset pair landed on the same timber. The ends of the feasible range
  // are the last chance to get two under this pack.
  const first = Math.min(...windows.map(([edge]) => edge));
  const last = Math.max(...windows.map(([, edge]) => edge));
  return apart(first, last) ? [first, last] : [low];
}

/**
 * Every timber under one deck, derived from the placements alone.
 *
 * Tier by tier from the bottom: each tier's thickness comes from
 * `layerHeights`, and each pack's stations from the shaft the tier below
 * presents. A pack with fewer than `MIN_BEARERS_PER_PACK` timbers here is a
 * pack the validator rejects, so what the drawings show is exactly what the
 * rule was applied to.
 */
export function deckBearers(
  placements: readonly Placement[],
  catalogue: Catalogue,
  options: LoadingOptions,
): Bearer[] {
  const heights = layerHeights(placements, catalogue, options);
  const bearers: Bearer[] = [];
  let below: Placement[] | null = null;

  for (const [tier, packs] of layersOf(placements)) {
    const ground = below ? bearingGround(below, catalogue) : null;
    const height = heights.get(tier);
    for (const [pack, inPack] of packs) {
      const span = packLateralSpan(inPack, catalogue);
      if (!span || !height) {
        continue;
      }
      for (const x of bearerStations(resolve(inPack, catalogue), ground)) {
        bearers.push({
          tier,
          pack,
          x,
          width: BEARER_WIDTH,
          span,
          thickness: height.dunnage,
          top: height.base,
        });
      }
    }
    below = flattenPacks(packs);
  }

  return bearers;
}

/** A deck's bearers keyed `tier:pack`, in the order they were derived. */
function groupBearers(bearers: readonly Bearer[]): Map<string, Bearer[]> {
  return groupBy(bearers, bearer => `${bearer.tier}:${bearer.pack}`);
}

/**
 * Whether every pack of a deck gets its timbers. The packer checks tiers with
 * this before keeping them, so a plan that cannot be borne is never offered.
 */
export function everyPackIsBorne(
  placements: readonly Placement[],
  catalogue: Catalogue,
  options: LoadingOptions,
): boolean {
  const borne = groupBearers(deckBearers(placements, catalogue, options));
  for (const [tier, packs] of layersOf(placements)) {
    for (const pack of packs.keys()) {
      if ((borne.get(`${tier}:${pack}`)?.length ?? 0) < MIN_BEARERS_PER_PACK) {
        return false;
      }
    }
  }
  return true;
}

/** One kind of pile inside a pack, rolled up for the manifest. */
export interface PackContent {
  readonly code: string;
  readonly part: PilePart;
  readonly length: Millimetres;
  readonly count: number;
}

/** Everything the manifest and the drawings say about one pack. */
export interface PackSummary {
  /** Human id, "P1" onward, per deck — tier by tier, front to rear. */
  readonly id: string;
  readonly tier: number;
  /** The stored pack index within its tier. */
  readonly pack: number;
  readonly placements: readonly Placement[];
  readonly contents: readonly PackContent[];
  /** Length of the longest pile aboard. */
  readonly length: Millimetres;
  readonly width: Millimetres;
  readonly span: readonly [Millimetres, Millimetres] | null;
  /** Leading end along the deck. */
  readonly x: Millimetres;
  readonly mass: Kilograms;
  /** Bearer thickness under the pack's tier. */
  readonly dunnage: Millimetres;
  /** The timbers this pack rides on, front to rear. */
  readonly bearers: readonly Bearer[];
}

/**
 * Every pack of one deck, described for people: ids run tier by tier from
 * the bottom, front of deck to rear, left to right. Derived and never
 * stored, so the table and the drawings cannot disagree about which pack is
 * which.
 */
export function packManifest(
  placements: readonly Placement[],
  catalogue: Catalogue,
  options: LoadingOptions,
): PackSummary[] {
  const heights = layerHeights(placements, catalogue, options);
  const bearers = groupBearers(deckBearers(placements, catalogue, options));

  const entries: Omit<PackSummary, 'id'>[] = [];
  for (const [tier, packs] of layersOf(placements)) {
    for (const [pack, inPack] of packs) {
      const resolved = resolve(inPack, catalogue);
      const counts = new Map<string, PackContent>();
      for (const pile of resolved) {
        const key = pile.type.id;
        const held = counts.get(key);
        counts.set(
          key,
          held
            ? {...held, count: held.count + 1}
            : {
                code: pileTypeCode(pile.type),
                part: pilePartOf(pile.type),
                length: pile.type.length,
                count: 1,
              },
        );
      }
      entries.push({
        tier,
        pack,
        placements: inPack,
        contents: [...counts.values()].sort(
          (a, b) => b.count - a.count || b.length - a.length,
        ),
        length: resolved.length
          ? Math.max(...resolved.map(pile => pile.type.length))
          : 0,
        width: packWidth(inPack, catalogue),
        span: packLateralSpan(inPack, catalogue),
        x: resolved.length
          ? Math.min(...resolved.map(pile => pile.placement.x))
          : 0,
        mass: packMass(inPack, catalogue),
        dunnage: heights.get(tier)?.dunnage ?? options.dunnageThickness,
        bearers: bearers.get(`${tier}:${pack}`) ?? [],
      });
    }
  }

  entries.sort(
    (a, b) =>
      a.tier - b.tier ||
      a.x - b.x ||
      (a.span?.[0] ?? 0) - (b.span?.[0] ?? 0) ||
      a.pack - b.pack,
  );
  return entries.map((entry, index) => ({...entry, id: `P${index + 1}`}));
}
