import {
  findPileType,
  findVehicle,
  type Catalogue,
  type LoadPlan,
} from '../domain/catalogue';
import {balanceOffset, isBalanced} from '../domain/balance';
import {
  ancillaryMass,
  axisHeightOf,
  loadHeight,
  tierHeights,
  type LoadingOptions,
} from '../domain/loading';
import {maxRadius} from '../domain/pile';
import type {PlacedPile, Placement} from '../domain/placement';
import {
  balanceTargetOf,
  payloadCapacity,
  type Vehicle,
} from '../domain/vehicle';
import {requiredLateralSeparation} from '../geometry/separation';
import {NZ_VDAM_2016, type VdamRuleset} from '../rules/nzVdam';
import {GEOMETRIC_EPSILON, toMetres, type Millimetres} from '../units';

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

/** How far a load projects past each end of the deck. Zero when it does not. */
export interface LoadOverhang {
  readonly front: Millimetres;
  readonly rear: Millimetres;
}

/**
 * What the load actually hangs out by, to put beside what the vehicle allows.
 *
 * The allowance lives on the vehicle, because VDAM states rear overhang against
 * axle spacing and that is a fact about a unit rather than about a job. This is
 * the other half of the sentence — without it a plan quietly using an overhang
 * looks exactly like one that does not.
 */
export function loadOverhang(
  placements: readonly Placement[],
  catalogue: Catalogue,
  vehicle: Vehicle,
): LoadOverhang {
  let front = 0;
  let rear = 0;
  for (const placement of placements) {
    const type = findPileType(catalogue, placement.pileTypeId);
    if (!type) {
      continue;
    }
    front = Math.max(front, -placement.x);
    rear = Math.max(rear, placement.x + type.length - vehicle.deckLength);
  }
  return {front, rear};
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

  const byConsignment = new Map<string, Placement[]>();
  for (const placement of plan.placements) {
    const group = byConsignment.get(placement.consignmentId) ?? [];
    group.push(placement);
    byConsignment.set(placement.consignmentId, group);
  }

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
    const placements = byConsignment.get(consignment.id) ?? [];
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

    const mass = consignmentPayload(placements, catalogue, options);
    const payload = payloadCapacity(vehicle);
    if (mass > payload) {
      violations.push(
        error(
          consignment.id,
          'over-payload',
          `load is ${mass.toLocaleString('en-NZ')} kg with bearers and lashings, over the ${payload.toLocaleString('en-NZ')} kg payload by ${(mass - payload).toLocaleString('en-NZ')} kg`,
        ),
      );
    }

    const height =
      vehicle.deckHeight + loadHeight(placements, catalogue, options);
    if (height > ruleset.maxHeight) {
      violations.push(
        error(
          consignment.id,
          'over-height',
          `loaded height is ${toMetres(height).toFixed(2)} m, over the ${toMetres(ruleset.maxHeight).toFixed(1)} m limit`,
        ),
      );
    }

    const width = loadWidth(placements, catalogue);
    if (width > ruleset.maxWidth) {
      violations.push(
        error(
          consignment.id,
          'over-width',
          `load is ${toMetres(width).toFixed(2)} m wide, over the ${toMetres(ruleset.maxWidth).toFixed(2)} m limit`,
        ),
      );
    }
    if (width > vehicle.deckWidth) {
      violations.push(
        warning(
          consignment.id,
          'overhangs-side',
          `load is wider than the ${toMetres(vehicle.deckWidth).toFixed(2)} m deck`,
        ),
      );
    }

    violations.push(
      ...checkEnvelope(consignment.id, placements, catalogue, vehicle, options),
    );
    violations.push(
      ...checkBalance(consignment.id, placements, catalogue, vehicle, options),
    );
    violations.push(
      ...checkSeparations(consignment.id, placements, catalogue, options),
    );
    violations.push(
      ...checkSupport(consignment.id, placements, catalogue, options),
    );
  }

  return violations;
}

/**
 * Merge overlapping or nearly-touching intervals into a covered span list.
 *
 * Exported because the packer builds tiers against it. If it had its own idea
 * of when bearers bridge a gap it would produce loads this rule then rejects.
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

  const byTier = new Map<number, Placement[]>();
  for (const placement of placements) {
    byTier.set(placement.tier, [
      ...(byTier.get(placement.tier) ?? []),
      placement,
    ]);
  }

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

/**
 * The load inside the space the vehicle actually has: along the deck, across
 * it, and clear of the side margins.
 *
 * Overhang is judged against what the yard has said this unit will accept, not
 * against VDAM's own rear-overhang formula — that one is stated as a fraction of
 * axle spacing, and axle positions are deliberately not modelled. An overhang
 * inside the allowance is still worth mentioning, because past a metre it needs
 * flags by day and lamps at night.
 */
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
    if (front > vehicle.maxFrontOverhang + GEOMETRIC_EPSILON) {
      violations.push(
        error(
          consignmentId,
          'ahead-of-headboard',
          vehicle.maxFrontOverhang > 0
            ? `${placement.id} projects ${Math.round(front)} mm ahead of the headboard, over the ${vehicle.maxFrontOverhang} mm allowed`
            : `${placement.id} starts ${Math.round(front)} mm ahead of the headboard`,
        ),
      );
    }

    const overhang = placement.x + type.length - vehicle.deckLength;
    if (overhang > vehicle.maxRearOverhang + GEOMETRIC_EPSILON) {
      violations.push(
        error(
          consignmentId,
          'over-rear-overhang',
          vehicle.maxRearOverhang > 0
            ? `${placement.id} overhangs the deck by ${Math.round(overhang)} mm, over the ${vehicle.maxRearOverhang} mm allowed`
            : `${placement.id} overhangs the deck by ${Math.round(overhang)} mm, and this vehicle is set to carry no overhang`,
        ),
      );
    } else if (overhang > GEOMETRIC_EPSILON) {
      violations.push(
        overhang > 1000
          ? warning(
              consignmentId,
              'rear-overhang',
              `${placement.id} overhangs the deck by ${Math.round(overhang)} mm — over 1 m, so it needs flags by day and lamps at night`,
            )
          : warning(
              consignmentId,
              'rear-overhang',
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

  const heights = tierHeights(placements, catalogue, options);
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
        const deltaZ =
          axisHeightOf(a, heights, options) - axisHeightOf(b, heights, options);
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
