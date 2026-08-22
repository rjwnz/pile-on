import {
  findPileType,
  findVehicle,
  type Catalogue,
  type LoadPlan,
} from '../domain/catalogue';
import {loadHeight, type LoadingOptions} from '../domain/loading';
import {maxRadius} from '../domain/pile';
import type {PlacedPile, Placement} from '../domain/placement';
import {payloadCapacity} from '../domain/vehicle';
import {requiredLateralSeparation} from '../geometry/separation';
import {NZ_VDAM_2016, type VdamRuleset} from '../rules/nzVdam';
import {GEOMETRIC_EPSILON, toMetres} from '../units';

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

/** Mass of everything placed on a consignment, dunnage excluded. */
export function consignmentMass(
  placements: readonly Placement[],
  catalogue: Catalogue,
): number {
  return placements.reduce((total, placement) => {
    const type = findPileType(catalogue, placement.pileTypeId);
    return type ? total + type.mass : total;
  }, 0);
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

    const mass = consignmentMass(placements, catalogue);
    const payload = payloadCapacity(vehicle);
    if (mass > payload) {
      violations.push(
        error(
          consignment.id,
          'over-payload',
          `load is ${mass.toLocaleString('en-NZ')} kg, over the ${payload.toLocaleString('en-NZ')} kg payload by ${(mass - payload).toLocaleString('en-NZ')} kg`,
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
      ...checkDeckBounds(
        consignment.id,
        placements,
        catalogue,
        vehicle.deckLength,
      ),
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

/** Merge overlapping or nearly-touching intervals into a covered span list. */
function coveredSpans(
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

function checkDeckBounds(
  consignmentId: string,
  placements: readonly Placement[],
  catalogue: Catalogue,
  deckLength: number,
): Violation[] {
  const violations: Violation[] = [];
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
    if (placement.x < -GEOMETRIC_EPSILON) {
      violations.push(
        error(
          consignmentId,
          'ahead-of-headboard',
          `${placement.id} starts ${-placement.x} mm ahead of the headboard`,
        ),
      );
    }
    const overhang = placement.x + type.length - deckLength;
    if (overhang > GEOMETRIC_EPSILON) {
      violations.push(
        overhang > 1000
          ? warning(
              consignmentId,
              'rear-overhang',
              `${placement.id} overhangs the deck by ${overhang} mm — over 1 m, so it needs flags by day and lamps at night`,
            )
          : warning(
              consignmentId,
              'rear-overhang',
              `${placement.id} overhangs the deck by ${overhang} mm`,
            ),
      );
    }
  }
  return violations;
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
        const required = requiredLateralSeparation(a, b, options);
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
