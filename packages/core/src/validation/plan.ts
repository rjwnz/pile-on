import {
  findPileType,
  findVehicle,
  type Catalogue,
  type LoadPlan,
} from '../domain/catalogue';
import {balanceOffset, isBalanced} from '../domain/balance';
import {
  MAX_LOAD_HEIGHT,
  ancillaryMass,
  axisHeightOf,
  loadHeight,
  type LoadingOptions,
} from '../domain/loading';
import {
  MIN_BEARERS_PER_PACK,
  PACK_MAX_WIDTH,
  bearingGround,
  coveredSpans,
  deckBearers,
  footprintOver,
  layerHeights,
  layersOf,
  packLateralSpan,
  packLongitudinalSpan,
  packMass,
  packWidth,
} from '../domain/packs';

// Re-exported from its old home so existing importers keep working; the
// packer and this file must share one idea of when bearers bridge a gap.
export {coveredSpans} from '../domain/packs';
import {maxRadius, pilePartOf, pileTypeCode} from '../domain/pile';
import type {DeckRole, PlacedPile, Placement} from '../domain/placement';
import {
  balanceTargetOf,
  isTrailer,
  payloadCapacity,
  type Vehicle,
} from '../domain/vehicle';
import {requiredLateralSeparation} from '../geometry/separation';
import {NZ_VDAM_2016, type VdamRuleset} from '../rules/nzVdam';
import {GEOMETRIC_EPSILON, toMetres} from '../units';
import {groupBy} from '../collections';

/**
 * The one place that decides whether a load plan is legal.
 *
 * Both the arranger and the manual editor call this. If the two could disagree
 * about what is allowed, the drawing would stop being worth checking against —
 * which is the entire point of the drawing.
 */
export interface Violation {
  readonly severity: 'error' | 'warning';
  readonly consignmentId: string;
  /** Short machine-ish tag, useful for grouping and for tests. */
  readonly rule: string;
  readonly message: string;
}

function error(
  consignmentId: string,
  rule: string,
  message: string,
): Violation {
  return {severity: 'error', consignmentId, rule, message};
}

function warning(
  consignmentId: string,
  rule: string,
  message: string,
): Violation {
  return {severity: 'warning', consignmentId, rule, message};
}

/** Mass of the piles on a consignment, bearers and lashings excluded. */
export function consignmentMass(
  placements: readonly Placement[],
  catalogue: Catalogue,
): number {
  return placements.reduce((total, placement) => {
    const type = findPileType(catalogue, placement.pileTypeId);
    return type ? total + type.mass : total;
  }, 0);
}

/**
 * Everything the payload has to carry: piles plus the bearers, chocks and
 * lashings that hold them down. This is the figure the payload limit applies
 * to, not `consignmentMass` — a plan that is under the limit only because the
 * dunnage was not counted is over the limit at the weighbridge.
 */
export function consignmentPayload(
  placements: readonly Placement[],
  catalogue: Catalogue,
  options: LoadingOptions,
): number {
  return (
    consignmentMass(placements, catalogue) + ancillaryMass(placements, options)
  );
}

/** Widest point of the load, measured across the deck. */
export function loadWidth(
  placements: readonly Placement[],
  catalogue: Catalogue,
): number {
  let widest = 0;
  for (const placement of placements) {
    const type = findPileType(catalogue, placement.pileTypeId);
    if (type) {
      widest = Math.max(widest, Math.abs(placement.y) + maxRadius(type));
    }
  }
  return widest * 2;
}

export function validatePlan(
  plan: LoadPlan,
  catalogue: Catalogue,
  options: LoadingOptions,
  ruleset: VdamRuleset = NZ_VDAM_2016,
): Violation[] {
  const violations: Violation[] = [];

  const byConsignment = groupBy(
    plan.placements,
    placement => placement.consignmentId,
  );

  const knownConsignments = new Set(plan.consignments.map(c => c.id));
  for (const consignmentId of byConsignment.keys()) {
    if (!knownConsignments.has(consignmentId)) {
      violations.push(
        error(
          consignmentId,
          'unknown-consignment',
          'placements reference a consignment that is not in the plan',
        ),
      );
    }
  }

  for (const consignment of plan.consignments) {
    const all = byConsignment.get(consignment.id) ?? [];
    const vehicle = findVehicle(catalogue, consignment.vehicleId);

    if (!vehicle) {
      violations.push(
        error(
          consignment.id,
          'unknown-vehicle',
          `vehicle "${consignment.vehicleId}" is not in the catalogue`,
        ),
      );
      continue;
    }
    if (isTrailer(vehicle)) {
      violations.push(
        error(
          consignment.id,
          'vehicle-is-trailer',
          `vehicle "${vehicle.id}" is a trailer — a movement must be led by a self-propelled truck`,
        ),
      );
      continue;
    }

    /*
     * Resolve the trailer. A wrong pairing still gets its deck checked — the
     * pairing error is already reported, and the geometry is still geometry.
     */
    let trailer: Vehicle | null = null;
    if (consignment.trailerId) {
      const towed = findVehicle(catalogue, consignment.trailerId);
      if (!towed) {
        violations.push(
          error(
            consignment.id,
            'unknown-trailer',
            `trailer "${consignment.trailerId}" is not in the catalogue`,
          ),
        );
      } else {
        if (!towed.towableBy.includes(vehicle.id)) {
          violations.push(
            error(
              consignment.id,
              'not-towable',
              `trailer "${towed.id}" is not listed as towable by ${vehicle.id}`,
            ),
          );
        }
        trailer = towed;
      }
    }

    const truckPlacements = all.filter(p => p.deck === 'truck');
    const trailerPlacements = all.filter(p => p.deck === 'trailer');

    if (trailerPlacements.length > 0 && !trailer) {
      // Excluded from the per-deck checks below rather than silently judged
      // against the truck: there is no deck to judge them against.
      violations.push(
        error(
          consignment.id,
          'phantom-deck',
          `${trailerPlacements.length} placements sit on a trailer deck, but this consignment has no trailer`,
        ),
      );
    }

    // A solo movement reads exactly as it always did; only a movement with a
    // trailer needs its messages to say which deck they mean.
    const prefixed = (deck: DeckRole, found: Violation[]) =>
      trailer
        ? found.map(v => ({...v, message: `${deck} deck: ${v.message}`}))
        : found;

    violations.push(
      ...prefixed(
        'truck',
        deckViolations(
          consignment.id,
          truckPlacements,
          vehicle,
          catalogue,
          options,
          ruleset,
        ),
      ),
    );
    if (trailer) {
      violations.push(
        ...prefixed(
          'trailer',
          deckViolations(
            consignment.id,
            trailerPlacements,
            trailer,
            catalogue,
            options,
            ruleset,
          ),
        ),
      );
    }
  }

  return violations;
}

/** Everything one deck is checked against, given the row it is loaded on. */
function deckViolations(
  consignmentId: string,
  placements: readonly Placement[],
  vehicle: Vehicle,
  catalogue: Catalogue,
  options: LoadingOptions,
  ruleset: VdamRuleset,
): Violation[] {
  const violations: Violation[] = [];

  const mass = consignmentPayload(placements, catalogue, options);
  const payload = payloadCapacity(vehicle);
  if (mass > payload) {
    violations.push(
      error(
        consignmentId,
        'over-payload',
        `load is ${mass.toLocaleString('en-NZ')} kg with bearers and lashings, over the ${payload.toLocaleString('en-NZ')} kg payload by ${(mass - payload).toLocaleString('en-NZ')} kg`,
      ),
    );
  }

  const height = loadHeight(placements, catalogue, options);
  if (height > MAX_LOAD_HEIGHT) {
    violations.push(
      error(
        consignmentId,
        'over-height',
        `load stands ${toMetres(height).toFixed(2)} m above the deck, over the ${toMetres(MAX_LOAD_HEIGHT).toFixed(1)} m the fleet can carry`,
      ),
    );
  }

  const width = loadWidth(placements, catalogue);
  if (width > ruleset.maxWidth) {
    violations.push(
      error(
        consignmentId,
        'over-width',
        `load is ${toMetres(width).toFixed(2)} m wide, over the ${toMetres(ruleset.maxWidth).toFixed(2)} m limit`,
      ),
    );
  }
  if (width > vehicle.deckWidth) {
    violations.push(
      warning(
        consignmentId,
        'overhangs-side',
        `load is wider than the ${toMetres(vehicle.deckWidth).toFixed(2)} m deck`,
      ),
    );
  }

  violations.push(
    ...checkEnvelope(consignmentId, placements, catalogue, vehicle, options),
  );
  violations.push(
    ...checkBalance(consignmentId, placements, catalogue, vehicle, options),
  );
  violations.push(
    ...checkSeparations(consignmentId, placements, catalogue, options),
  );
  violations.push(
    ...checkSupport(consignmentId, placements, catalogue, options),
  );
  violations.push(...checkPacks(consignmentId, placements, catalogue, options));
  violations.push(
    ...checkLateralSupport(consignmentId, placements, catalogue, options),
  );
  violations.push(
    ...checkBearers(consignmentId, placements, catalogue, options),
  );

  return violations;
}

/** Whether two longitudinal spans genuinely share a stretch of deck. */
function spansOverlap(
  a: readonly [number, number],
  b: readonly [number, number],
): boolean {
  return a[0] < b[1] - GEOMETRIC_EPSILON && b[0] < a[1] - GEOMETRIC_EPSILON;
}

/**
 * Packs are how piles actually travel: banded single-type bundles, at most
 * `PACK_MAX_WIDTH` across, laid in rows along the deck with at most two
 * abreast at any station, and side-by-side neighbours weighing alike.
 * Everything here reads the same `domain/packs` helpers the packer builds
 * with, so the two cannot drift.
 */
function checkPacks(
  consignmentId: string,
  placements: readonly Placement[],
  catalogue: Catalogue,
  options: LoadingOptions,
): Violation[] {
  const violations: Violation[] = [];

  for (const [tier, packs] of layersOf(placements)) {
    /*
     * At most two packs abreast: no station along the deck may have three
     * packs across it. Intervals on a line obey Helly's theorem — three
     * intervals that pairwise overlap share a common point — so checking
     * triples for mutual overlap is exact, not an approximation.
     */
    const extents = [...packs.entries()].flatMap(([index, pack]) => {
      const xSpan = packLongitudinalSpan(pack, catalogue);
      return xSpan ? [{index, pack, xSpan}] : [];
    });
    let crowded = false;
    for (let i = 0; i < extents.length && !crowded; i++) {
      for (let j = i + 1; j < extents.length && !crowded; j++) {
        if (!spansOverlap(extents[i]!.xSpan, extents[j]!.xSpan)) {
          continue;
        }
        for (let k = j + 1; k < extents.length && !crowded; k++) {
          if (
            spansOverlap(extents[i]!.xSpan, extents[k]!.xSpan) &&
            spansOverlap(extents[j]!.xSpan, extents[k]!.xSpan)
          ) {
            crowded = true;
          }
        }
      }
    }
    if (crowded) {
      violations.push(
        error(
          consignmentId,
          'too-many-packs',
          `three packs of tier ${tier + 1} ride abreast at one station — at most two packs sit side by side`,
        ),
      );
    }

    if (options.minPackMassRatio > 0) {
      for (let i = 0; i < extents.length; i++) {
        for (let j = i + 1; j < extents.length; j++) {
          if (!spansOverlap(extents[i]!.xSpan, extents[j]!.xSpan)) {
            continue;
          }
          const massA = packMass(extents[i]!.pack, catalogue);
          const massB = packMass(extents[j]!.pack, catalogue);
          const lighter = Math.min(massA, massB);
          const heavier = Math.max(massA, massB);
          if (
            heavier > 0 &&
            lighter + GEOMETRIC_EPSILON < options.minPackMassRatio * heavier
          ) {
            violations.push(
              error(
                consignmentId,
                'packs-unbalanced',
                `packs riding abreast in tier ${tier + 1} weigh ${Math.round(lighter)} kg and ${Math.round(heavier)} kg — the lighter must be at least ${Math.round(options.minPackMassRatio * 100)}% of the heavier`,
              ),
            );
          }
        }
      }
    }

    for (const [index, pack] of packs) {
      const width = packWidth(pack, catalogue);
      if (width > PACK_MAX_WIDTH + GEOMETRIC_EPSILON) {
        violations.push(
          error(
            consignmentId,
            'pack-too-wide',
            `pack ${index + 1} of tier ${tier + 1} is ${Math.round(width)} mm across, over the ${PACK_MAX_WIDTH} mm a pack may be banded`,
          ),
        );
      }

      const codes = new Set<string>();
      const parts = new Set<string>();
      for (const placement of pack) {
        const type = findPileType(catalogue, placement.pileTypeId);
        if (type) {
          codes.add(pileTypeCode(type));
          parts.add(pilePartOf(type));
        }
      }
      if (codes.size > 1 || parts.size > 1) {
        violations.push(
          error(
            consignmentId,
            'pack-mixed-type',
            codes.size > 1
              ? `pack ${index + 1} of tier ${tier + 1} mixes pile types ${[...codes].join(' and ')} — a pack is banded from one type`
              : `pack ${index + 1} of tier ${tier + 1} mixes starters with extensions — they never share a pack`,
          ),
        );
      }

      const leads = pack
        .filter(placement => findPileType(catalogue, placement.pileTypeId))
        .map(placement => placement.x);
      if (
        leads.length > 1 &&
        Math.max(...leads) - Math.min(...leads) > GEOMETRIC_EPSILON
      ) {
        violations.push(
          error(
            consignmentId,
            'pack-not-flush',
            `pack ${index + 1} of tier ${tier + 1} is not banded flush — piles in a pack line up side by side, sharing their leading end`,
          ),
        );
      }
    }
  }

  return violations;
}

/**
 * Across the deck, a pack has to stand wholly on the packs below it — at
 * every station its steel covers, not just on the whole-tier average. The
 * bearers under a tier rest on the shafts of the tier beneath, so a pack may
 * bridge two packs only where their tops are level; `footprintOver` merges
 * exactly those, per stretch of deck. Layers narrow going up, never overhang.
 */
function checkLateralSupport(
  consignmentId: string,
  placements: readonly Placement[],
  catalogue: Catalogue,
  options: LoadingOptions,
): Violation[] {
  const violations: Violation[] = [];
  const tiers = [...layersOf(placements)];

  for (const [index, [tier, packs]] of tiers.entries()) {
    if (index === 0) {
      continue;
    }
    const below = [...tiers[index - 1]![1].values()].flat();

    for (const [packIndex, pack] of packs) {
      const span = packLateralSpan(pack, catalogue);
      const xSpan = packLongitudinalSpan(pack, catalogue);
      if (!span || !xSpan) {
        continue;
      }
      const footprint = footprintOver(
        below,
        catalogue,
        options,
        xSpan[0],
        xSpan[1],
      );
      if (footprint === null) {
        // Nothing beneath anywhere along the pack: the longitudinal support
        // rule owns that finding.
        continue;
      }
      const held = footprint.some(
        ([from, to]) =>
          span[0] >= from - GEOMETRIC_EPSILON &&
          span[1] <= to + GEOMETRIC_EPSILON,
      );
      if (!held) {
        violations.push(
          error(
            consignmentId,
            'unsupported-laterally',
            `pack ${packIndex + 1} of tier ${tier + 1} overhangs the packs below it — a pack must stand wholly on the tier beneath, all the way along`,
          ),
        );
      }
    }
  }

  return violations;
}

/**
 * Every pack rides on at least two timbers.
 *
 * A bundle seated on one bearer see-saws about it: the first hard brake pitches
 * it, and the lashings are holding a lever rather than a load. Two is the
 * floor, and the stations are not free — a timber has to land on shaft, clear
 * of the pack's own plates, and on something that will hold it, which above
 * the bottom tier means the shaft the tier below presents rather than the gap
 * between two rows. `deckBearers` derives exactly the timbers the drawings
 * show, so a pack flagged here is a pack whose drawing is visibly short of
 * bearers.
 */
function checkBearers(
  consignmentId: string,
  placements: readonly Placement[],
  catalogue: Catalogue,
  options: LoadingOptions,
): Violation[] {
  const counts = new Map<string, number>();
  for (const bearer of deckBearers(placements, catalogue, options)) {
    const key = `${bearer.tier}:${bearer.pack}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const violations: Violation[] = [];
  const tiers = [...layersOf(placements)];
  for (const [index, [tier, packs]] of tiers.entries()) {
    const ground =
      index === 0
        ? null
        : bearingGround([...tiers[index - 1]![1].values()].flat(), catalogue);

    for (const [pack, inPack] of packs) {
      const found = counts.get(`${tier}:${pack}`) ?? 0;
      if (found >= MIN_BEARERS_PER_PACK) {
        continue;
      }
      const span = packLongitudinalSpan(inPack, catalogue);
      if (!span) {
        continue;
      }
      if (
        ground &&
        !ground.some(([from, to]) => from < span[1] && to > span[0])
      ) {
        // Nothing under the pack at all: the longitudinal support rule owns
        // that finding, and it reads better than "nowhere to put a timber".
        continue;
      }
      violations.push(
        error(
          consignmentId,
          'too-few-bearers',
          `pack ${pack + 1} of tier ${tier + 1} lands on ${found === 0 ? 'no bearer' : `${found} bearer`} — a pack rides on ${MIN_BEARERS_PER_PACK} timbers at least, one near each end, and there is nowhere clear of its plates${tier > 0 ? ' and over the tier below' : ''} to put a second`,
        ),
      );
    }
  }

  return violations;
}

/**
 * Every pile above the bottom tier has to be resting on something.
 *
 * Support is judged along the deck only. Dunnage bearers run across the full
 * width, so a tier is carried wherever the tier below has material under the
 * bearers; the gaps that matter are longitudinal ones, where a partly filled
 * tier leaves the tier above it hanging over thin air.
 */
function checkSupport(
  consignmentId: string,
  placements: readonly Placement[],
  catalogue: Catalogue,
  options: LoadingOptions,
): Violation[] {
  const spanOf = (placement: Placement): [number, number] | null => {
    const type = findPileType(catalogue, placement.pileTypeId);
    return type ? [placement.x, placement.x + type.length] : null;
  };

  const byTier = groupBy(placements, placement => placement.tier);

  const violations: Violation[] = [];
  for (const [tier, inTier] of [...byTier].sort((a, b) => a[0] - b[0])) {
    if (tier === 0) {
      continue;
    }
    const below = byTier.get(tier - 1) ?? [];
    const support = coveredSpans(
      below.flatMap(placement => {
        const span = spanOf(placement);
        return span ? [span] : [];
      }),
      // Piles laid end to end leave a gap the bearers span quite happily.
      options.endGap + options.dunnageThickness,
    );

    const unsupported = inTier.filter(placement => {
      const span = spanOf(placement);
      if (!span) {
        return false;
      }
      return !support.some(
        ([start, end]) =>
          span[0] >= start - GEOMETRIC_EPSILON &&
          span[1] <= end + GEOMETRIC_EPSILON,
      );
    });

    if (unsupported.length > 0) {
      violations.push(
        error(
          consignmentId,
          'unsupported',
          `${unsupported.length} ${unsupported.length === 1 ? 'pile' : 'piles'} in tier ${tier + 1} overhang the tier below with nothing under them`,
        ),
      );
    }
  }

  return violations;
}

/** The load inside the space the vehicle actually has: along the deck, across
 * it, and clear of the side margins. No overhang is allowed. */
function checkEnvelope(
  consignmentId: string,
  placements: readonly Placement[],
  catalogue: Catalogue,
  vehicle: Vehicle,
  options: LoadingOptions,
): Violation[] {
  const violations: Violation[] = [];
  const halfWidth = vehicle.deckWidth / 2 - options.sideMargin;

  for (const placement of placements) {
    const type = findPileType(catalogue, placement.pileTypeId);
    if (!type) {
      violations.push(
        error(
          consignmentId,
          'unknown-pile-type',
          `placement ${placement.id} uses pile type "${placement.pileTypeId}", which is not in the catalogue`,
        ),
      );
      continue;
    }

    const front = -placement.x;
    if (front > GEOMETRIC_EPSILON) {
      violations.push(
        error(
          consignmentId,
          'ahead-of-headboard',
          `${placement.id} starts ${Math.round(front)} mm ahead of the headboard`,
        ),
      );
    }

    const overhang = placement.x + type.length - vehicle.deckLength;
    if (overhang > GEOMETRIC_EPSILON) {
      violations.push(
        error(
          consignmentId,
          'over-rear-overhang',
          `${placement.id} overhangs the deck by ${Math.round(overhang)} mm`,
        ),
      );
    }

    const reach = Math.abs(placement.y) + maxRadius(type);
    if (reach > halfWidth + GEOMETRIC_EPSILON) {
      violations.push(
        error(
          consignmentId,
          'outside-side-margin',
          `${placement.id} reaches ${Math.round(reach)} mm from the centreline, past the ${Math.round(halfWidth)} mm left by the ${options.sideMargin} mm side margin`,
        ),
      );
    }
  }

  return violations;
}

/**
 * The load sitting where the deck wants it, within tolerance.
 *
 * Not a legal limit — it stands in for axle share and roll stability, neither of
 * which this model can compute — which is exactly why the tolerance is settable
 * and why being outside it is an error rather than a note. See
 * `BalanceTolerance`.
 */
function checkBalance(
  consignmentId: string,
  placements: readonly Placement[],
  catalogue: Catalogue,
  vehicle: Vehicle,
  options: LoadingOptions,
): Violation[] {
  const offset = balanceOffset(placements, catalogue, vehicle);
  if (!offset || isBalanced(offset, options.balance)) {
    return [];
  }

  const parts: string[] = [];
  if (Math.abs(offset.longitudinal) > options.balance.longitudinal) {
    const target = balanceTargetOf(vehicle);
    parts.push(
      `${Math.round(Math.abs(offset.longitudinal))} mm ${offset.longitudinal > 0 ? 'aft of' : 'ahead of'} the ${Math.round(target)} mm balance point (tolerance ${options.balance.longitudinal} mm)`,
    );
  }
  if (Math.abs(offset.lateral) > options.balance.lateral) {
    parts.push(
      `${Math.round(Math.abs(offset.lateral))} mm to the ${offset.lateral > 0 ? 'right' : 'left'} of the centreline (tolerance ${options.balance.lateral} mm)`,
    );
  }

  return [
    error(
      consignmentId,
      'unbalanced',
      `load centre of mass is ${parts.join(', and ')}`,
    ),
  ];
}

function checkSeparations(
  consignmentId: string,
  placements: readonly Placement[],
  catalogue: Catalogue,
  options: LoadingOptions,
): Violation[] {
  const violations: Violation[] = [];
  const resolved = placements.flatMap<PlacedPile>(placement => {
    const type = findPileType(catalogue, placement.pileTypeId);
    return type ? [{type, placement}] : [];
  });

  const heights = layerHeights(placements, catalogue, options);
  const byTier = new Map<number, PlacedPile[]>();
  for (const placed of resolved) {
    const tier = byTier.get(placed.placement.tier) ?? [];
    tier.push(placed);
    byTier.set(placed.placement.tier, tier);
  }

  for (const tier of byTier.values()) {
    for (let i = 0; i < tier.length; i++) {
      for (let j = i + 1; j < tier.length; j++) {
        const a = tier[i]!;
        const b = tier[j]!;
        // Piles of different diameter rest on their own widest point, so their
        // axes sit at different heights even in the same tier. That offset is
        // clearance already spent, and ignoring it over-separates the load.
        const deltaZ = axisHeightOf(a, heights) - axisHeightOf(b, heights);
        const required = requiredLateralSeparation(a, b, options, deltaZ);
        const actual = Math.abs(a.placement.y - b.placement.y);
        if (required > 0 && actual + GEOMETRIC_EPSILON < required) {
          violations.push(
            error(
              consignmentId,
              'piles-clash',
              `${a.placement.id} and ${b.placement.id} are ${Math.round(actual)} mm apart but need ${Math.round(required)} mm`,
            ),
          );
        }
      }
    }
  }

  return violations;
}
