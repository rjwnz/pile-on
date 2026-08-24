import {
  combinationDeckArea,
  combinationsOf,
  findPileType,
  type Catalogue,
  type Consignment,
  type LoadPlan,
  type VehicleCombination,
} from '../domain/catalogue';
import {
  MAX_LOAD_HEIGHT,
  loadHeight,
  type LoadingOptions,
} from '../domain/loading';
import {PACK_MAX_WIDTH} from '../domain/packs';
import type {Job, JobLine} from '../domain/job';
import {maxRadius, type PileType} from '../domain/pile';
import type {DeckRole, Placement} from '../domain/placement';
import {balanceTargetOf, type Vehicle} from '../domain/vehicle';
import {GEOMETRIC_EPSILON, type Kilograms, type Millimetres} from '../units';
import {shiftToBalance} from './balance';
import {unplaceableOnFleet, type UnplacedDemand} from './feasibility';

/**
 * The naive bounding-box arranger — the *control* the packer has to beat.
 * Every pile is a cylinder of its widest diameter, one type per tier, nothing
 * staggered or flipped. Licensed to pack badly, not illegally: a baseline that
 * fails `validatePlan` measures nothing.
 */

export interface Lane {
  readonly y: Millimetres;
  /** Which of the tier's (at most two) packs the lane belongs to. */
  readonly pack: number;
}

export interface ArrangeResult {
  readonly plan: LoadPlan;
  /** Demand the arranger could not fit anywhere, with why. */
  readonly unplaced: readonly UnplacedDemand[];
}

/**
 * What a single pack of lanes of this pile type measures, or null when the
 * type cannot be laned on this deck at all. Every pile is its widest all the
 * way along here, so neighbouring lanes always present plate to plate —
 * nothing in the baseline ever staggers them apart.
 */
function laneGeometry(
  vehicle: Vehicle,
  type: PileType,
  options: LoadingOptions,
) {
  const halfWidth = maxRadius(type);
  const usable = vehicle.deckWidth - options.sideMargin * 2;
  if (usable < halfWidth * 2 || halfWidth * 2 > PACK_MAX_WIDTH) {
    return null;
  }
  const pitch = halfWidth * 2 + options.clearances.helixToHelix;
  return {
    halfWidth,
    usable,
    pitch,
    /** Most lanes one pack may band. */
    perPack: Math.floor((PACK_MAX_WIDTH - halfWidth * 2) / pitch) + 1,
    widthOf: (lanes: number) => (lanes - 1) * pitch + halfWidth * 2,
  };
}

/**
 * Lane centrelines for a tier given over to one pile type: two packs of
 * lanes side by side when they fit, one pack otherwise, each at most
 * `PACK_MAX_WIDTH` across and symmetric about the centreline.
 */
export function lanesFor(
  vehicle: Vehicle,
  type: PileType,
  options: LoadingOptions,
): Lane[] {
  const geometry = laneGeometry(vehicle, type, options);
  if (!geometry) {
    return [];
  }
  const {halfWidth, usable, pitch, perPack, widthOf} = geometry;
  const gap = options.clearances.helixToHelix;

  // Two equal packs when the deck takes them, shrunk together until they fit.
  let paired = perPack;
  while (paired >= 1 && widthOf(paired) * 2 + gap > usable) {
    paired--;
  }
  if (paired < 1) {
    // One pack, centred: as many lanes as the pack and the deck both allow.
    return singlePackLanes(vehicle, type, options);
  }

  const width = widthOf(paired);
  const leftEdge = -(width * 2 + gap) / 2;
  return [0, 1].flatMap(pack =>
    Array.from({length: paired}, (_, index) => ({
      y: leftEdge + pack * (width + gap) + halfWidth + index * pitch,
      pack,
    })),
  );
}

/** One centred pack of lanes — what a tier falls back to when a pair of
 * packs would weigh too unalike. */
function singlePackLanes(
  vehicle: Vehicle,
  type: PileType,
  options: LoadingOptions,
): Lane[] {
  const geometry = laneGeometry(vehicle, type, options);
  if (!geometry) {
    return [];
  }
  const {halfWidth, usable, pitch, perPack} = geometry;
  const count = Math.min(
    perPack,
    Math.floor((usable - halfWidth * 2) / pitch) + 1,
  );
  const span = (count - 1) * pitch;
  return Array.from({length: count}, (_, index) => ({
    y: -span / 2 + index * pitch,
    pack: 0,
  }));
}

/**
 * How many rows of packs fit end to end along the deck. A pack never lays
 * piles end to end inside itself — whole packs queue along the deck instead,
 * `endGap` apart.
 */
export function rowsFor(
  vehicle: Vehicle,
  type: PileType,
  options: LoadingOptions,
): number {
  const usable = vehicle.deckLength - options.headboardGap;
  if (usable < type.length) {
    return 0;
  }
  return Math.floor((usable + options.endGap) / (type.length + options.endGap));
}

/** A place one pile can go in a tier given over to a single type. */
interface Cell {
  readonly x: Millimetres;
  readonly y: Millimetres;
  readonly pack: number;
}

/** Leading x of each row of packs, nearest the balance point first — where
 * the leftovers land when demand runs out mid-tier. */
function rowSlots(
  vehicle: Vehicle,
  type: PileType,
  options: LoadingOptions,
): {readonly slot: number; readonly x: Millimetres}[] {
  const target = balanceTargetOf(vehicle);
  return Array.from({length: rowsFor(vehicle, type, options)}, (_, slot) => ({
    slot,
    x: options.headboardGap + slot * (type.length + options.endGap),
  })).sort(
    (a, b) =>
      Math.abs(a.x + type.length / 2 - target) -
      Math.abs(b.x + type.length / 2 - target),
  );
}

/**
 * Every slot in a full single-type tier: rows of paired packs along the
 * deck, rows nearest the balance point first. What a full tier holds, and
 * the hypothetical layout the height check measures.
 */
export function cellsFor(
  vehicle: Vehicle,
  type: PileType,
  options: LoadingOptions,
  lanes: readonly Lane[] = lanesFor(vehicle, type, options),
): Cell[] {
  return rowSlots(vehicle, type, options).flatMap(row =>
    lanes.map(lane => ({
      x: row.x,
      y: lane.y,
      pack: row.slot * 2 + lane.pack,
    })),
  );
}

interface OpenDeck {
  readonly role: DeckRole;
  readonly vehicle: Vehicle;
  tier: number;
  massUsed: Kilograms;
  /** The type the last tier was given over to. Only its own kind may stack
   * on it: a different type lays out different packs, and those would
   * overhang the footprint below. */
  lastTypeId: string | null;
  /** True once a part-filled tier means nothing may stack on this deck. */
  closed: boolean;
}

interface OpenMovement {
  readonly id: string;
  readonly decks: readonly OpenDeck[];
}

/**
 * The one combination the baseline ever sends: the biggest thing the yard
 * owns, by total deck area — used for every movement, whatever the job looks
 * like. That is the honest naive answer to owning a fleet.
 */
function naiveCombination(catalogue: Catalogue): VehicleCombination | null {
  const combos = combinationsOf(catalogue);
  if (combos.length === 0) {
    return null;
  }
  return combos.reduce((biggest, combo) => {
    const byArea = combinationDeckArea(combo) - combinationDeckArea(biggest);
    if (byArea !== 0) {
      return byArea > 0 ? combo : biggest;
    }
    return combo.truck.id < biggest.truck.id ? combo : biggest;
  });
}

export function arrangeNaively(
  job: Job,
  catalogue: Catalogue,
  options: LoadingOptions,
): ArrangeResult {
  const placements: Placement[] = [];
  const consignments: Consignment[] = [];
  const unplaced: UnplacedDemand[] = [];

  const combo = naiveCombination(catalogue);
  if (!combo) {
    for (const line of job.lines) {
      if (line.quantity > 0 && findPileType(catalogue, line.pileTypeId)) {
        unplaced.push({
          pileTypeId: line.pileTypeId,
          quantity: line.quantity,
          reason: 'no self-propelled truck in the catalogue',
        });
      }
    }
    return {plan: {consignments: [], placements: []}, unplaced};
  }

  let movement: OpenMovement | null = null;
  function openMovement(): OpenMovement {
    const id = `C${consignments.length + 1}`;
    consignments.push({
      id,
      vehicleId: combo!.truck.id,
      trailerId: combo!.trailer?.id ?? null,
      phase: null,
    });
    const decks: OpenDeck[] = [
      {
        role: 'truck',
        vehicle: combo!.truck,
        tier: 0,
        massUsed: 0,
        lastTypeId: null,
        closed: false,
      },
    ];
    if (combo!.trailer) {
      decks.push({
        role: 'trailer',
        vehicle: combo!.trailer,
        tier: 0,
        massUsed: 0,
        lastTypeId: null,
        closed: false,
      });
    }
    return {id, decks};
  }

  /** Demand, widest first — a big-piles-first order keeps tiers from thrashing. */
  const demand = [...job.lines]
    .filter(line => line.quantity > 0)
    .map(line => ({line, type: findPileType(catalogue, line.pileTypeId)}))
    .filter(
      (entry): entry is {line: JobLine; type: PileType} =>
        entry.type !== undefined,
    )
    .sort((a, b) => b.type.length - a.type.length || b.type.mass - a.type.mass);

  // Usable span is the deck alone.
  const deckOnly = (vehicle: Vehicle) => ({
    length: vehicle.deckLength - options.headboardGap,
    width: vehicle.deckWidth - options.sideMargin * 2,
  });

  /** Whether this deck can take one more tier of this type, and how many piles. */
  function tierCapacity(deck: OpenDeck, type: PileType): number {
    if (deck.closed || deck.tier >= options.maxTiers) {
      return 0;
    }
    if (deck.lastTypeId !== null && deck.lastTypeId !== type.id) {
      return 0;
    }
    const cells = cellsFor(deck.vehicle, type, options);
    if (cells.length === 0) {
      return 0;
    }
    /*
     * Bearers are derived from the whole stack — the baseline never staggers
     * or flips, so its plates align vertically and its bearers come out
     * thick. Judged the honest way: lay the full hypothetical tier and
     * measure the stack it would make.
     */
    const existing = movement
      ? placements.filter(
          p => p.consignmentId === movement!.id && p.deck === deck.role,
        )
      : [];
    const hypothetical: Placement[] = cells.map((cell, index) => ({
      id: `hypothetical-${index}`,
      consignmentId: existing[0]?.consignmentId ?? 'hypothetical',
      deck: deck.role,
      pileTypeId: type.id,
      tier: deck.tier,
      pack: cell.pack,
      x: cell.x,
      y: cell.y,
      flipped: false,
    }));
    if (
      loadHeight([...existing, ...hypothetical], catalogue, options) >
      MAX_LOAD_HEIGHT
    ) {
      return 0;
    }
    const spare =
      deck.vehicle.payloadCapacity -
      deck.massUsed -
      options.ancillaryMassPerTier;
    const byMass = Math.floor(spare / type.mass);
    return Math.max(0, Math.min(cells.length, byMass));
  }

  for (const {line, type} of demand) {
    const reason = unplaceableOnFleet(type, [combo], options, deckOnly);
    if (reason) {
      unplaced.push({pileTypeId: type.id, quantity: line.quantity, reason});
      continue;
    }

    let remaining = line.quantity;
    while (remaining > 0) {
      if (movement === null) {
        movement = openMovement();
      }

      const deck = movement.decks.find(entry => tierCapacity(entry, type) > 0);

      if (!deck) {
        // Neither deck takes even one pile. A fresh movement whose decks both
        // refuse can never accept this type, so report rather than loop.
        const fresh = movement.decks.every(
          entry => entry.tier === 0 && !entry.closed,
        );
        if (fresh) {
          unplaced.push({
            pileTypeId: type.id,
            quantity: remaining,
            reason: 'no room on the naive combination once bearers are counted',
          });
          break;
        }
        movement = null;
        continue;
      }

      const take = Math.min(remaining, tierCapacity(deck, type));

      /*
       * Fill rows of packs, nearest the balance point first. A full row is a
       * balanced pair; a partial row prefers one centred pack, and where the
       * leftovers would split a pair too unevenly — every pile here weighs
       * the same, so the rule is a head count — the row takes a centred pack
       * of what fits and carries the rest to the next row.
       */
      const pairLanes = lanesFor(deck.vehicle, type, options);
      const soloCap = singlePackLanes(deck.vehicle, type, options).length;
      const bySide = [0, 1].map(side =>
        pairLanes
          .filter(lane => lane.pack === side)
          .sort((a, b) => Math.abs(a.y) - Math.abs(b.y)),
      );
      const ratio = options.minPackMassRatio;
      // A solo row is re-centred for however many piles it actually holds —
      // a part-filled pack parked at one side would tip the load.
      const pitch = maxRadius(type) * 2 + options.clearances.helixToHelix;
      const centredYs = (count: number): number[] =>
        Array.from(
          {length: count},
          (_, index) => (index - (count - 1) / 2) * pitch,
        );

      const chosen: Cell[] = [];
      let toPlace = take;
      for (const row of rowSlots(deck.vehicle, type, options)) {
        if (toPlace <= 0) {
          break;
        }
        const wanted = Math.min(toPlace, pairLanes.length);
        const heavier = Math.ceil(wanted / 2);
        const lighter = wanted - heavier;
        const uneven =
          lighter > 0 && lighter < ratio * heavier - GEOMETRIC_EPSILON;
        const partial = wanted < pairLanes.length;

        if ((uneven || partial) && wanted <= soloCap) {
          // One centred pack: balanced, and exempt from the weight match.
          for (const y of centredYs(wanted)) {
            chosen.push({x: row.x, y, pack: row.slot * 2});
          }
          toPlace -= wanted;
        } else if (uneven) {
          const held = Math.min(wanted, soloCap);
          for (const y of centredYs(held)) {
            chosen.push({x: row.x, y, pack: row.slot * 2});
          }
          toPlace -= held;
        } else {
          for (const [side, count] of [heavier, lighter].entries()) {
            for (const lane of bySide[side]!.slice(0, count)) {
              chosen.push({x: row.x, y: lane.y, pack: row.slot * 2 + side});
            }
          }
          toPlace -= wanted;
        }
      }

      const laid = chosen.length;
      if (laid === 0) {
        // The layouts could not hold even one pile; close the deck rather
        // than loop on it.
        deck.closed = true;
        if (movement.decks.every(entry => entry.closed)) {
          movement = null;
        }
        continue;
      }

      for (const [index, cell] of chosen.entries()) {
        placements.push({
          id: `${movement.id}-${deck.role}-T${deck.tier}-${index}`,
          consignmentId: movement.id,
          deck: deck.role,
          pileTypeId: type.id,
          tier: deck.tier,
          pack: cell.pack,
          x: cell.x,
          y: cell.y,
          flipped: false,
        });
      }

      remaining -= laid;
      deck.massUsed += laid * type.mass + options.ancillaryMassPerTier;
      deck.lastTypeId = type.id;
      deck.tier += 1;

      // A partly filled tier closes the deck: nothing may stack on a layer
      // that does not cover it, and `validatePlan` enforces that.
      if (laid < cellsFor(deck.vehicle, type, options).length) {
        deck.closed = true;
        if (movement.decks.every(entry => entry.closed)) {
          movement = null;
        }
      }
    }
  }

  // Slide each finished deck onto its own balance point, whole — so the shift
  // cannot affect separation or support.
  const balanced = consignments.flatMap(consignment => {
    const decks: {role: DeckRole; vehicle: Vehicle}[] = [
      {role: 'truck', vehicle: combo.truck},
    ];
    if (combo.trailer) {
      decks.push({role: 'trailer', vehicle: combo.trailer});
    }
    return decks.flatMap(({role, vehicle}) =>
      shiftToBalance(
        placements.filter(
          p => p.consignmentId === consignment.id && p.deck === role,
        ),
        catalogue,
        vehicle,
      ),
    );
  });

  return {plan: {consignments, placements: balanced}, unplaced};
}
