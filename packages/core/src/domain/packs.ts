import type {Kilograms, Millimetres} from '../units';
import {GEOMETRIC_EPSILON} from '../units';
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
 * A bearer is a single length of timber laid across the deck, touching only
 * shafts — a pile seats its *shaft* on the timber, and its plates hang below
 * and stand proud above. The bearers under a tier are sized in
 * `DUNNAGE_INCREMENT` steps so the tier's own plates clear everything
 * beneath: the deck, and every plate poking up from any tier below, however
 * far down it started. What this deliberately does not model is where along
 * the deck each timber lands — a station clear of plates is assumed to
 * exist, which holds for real catalogues where plates are short bands on
 * long shafts.
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
  const tiers = new Map<number, TierPacks>();
  for (const placement of placements) {
    let packs = tiers.get(placement.tier);
    if (!packs) {
      packs = new Map();
      tiers.set(placement.tier, packs);
    }
    const pack = packs.get(placement.pack);
    if (pack) {
      pack.push(placement);
    } else {
      packs.set(placement.pack, [placement]);
    }
  }
  return new Map([...tiers].sort((a, b) => a[0] - b[0]));
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
function intersectSpans(
  a: readonly (readonly [Millimetres, Millimetres])[],
  b: readonly (readonly [Millimetres, Millimetres])[],
): [Millimetres, Millimetres][] {
  const out: [Millimetres, Millimetres][] = [];
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
    const layer = [...packs.values()].flat();
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
