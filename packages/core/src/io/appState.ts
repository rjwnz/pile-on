import {
  EMPTY_CATALOGUE,
  EMPTY_PLAN,
  type Catalogue,
  type LoadPlan,
} from '../domain/catalogue';
import type {PileType} from '../domain/pile';
import type {Vehicle} from '../domain/vehicle';
import {NZ_VDAM_2016} from '../rules/nzVdam';
import {IssueLog, type Issue, type Result} from '../validation/result';

/**
 * Bump when a change to the shape cannot be read by the previous reader.
 * Adding an optional field does not need a bump; renaming or removing does.
 *
 * 2 — dropped `vehicle.axles`. Version 1 files still read cleanly: the axle
 *     data is simply ignored, and nothing else about the shape changed.
 */
export const STATE_FORMAT_VERSION = 2;

export interface AppState {
  readonly formatVersion: number;
  readonly savedAt: string;
  /**
   * Which VDAM ruleset produced this. NZ transport limits move — NZTA removed
   * 50MAX permits in August 2026 — so a quote has to record the rules it was
   * priced under or it cannot be explained six months later.
   */
  readonly rulesetVersion: string;
  readonly catalogue: Catalogue;
  readonly plan: LoadPlan;
}

export function emptyAppState(now: string): AppState {
  return {
    formatVersion: STATE_FORMAT_VERSION,
    savedAt: now,
    rulesetVersion: NZ_VDAM_2016.version,
    catalogue: EMPTY_CATALOGUE,
    plan: EMPTY_PLAN,
  };
}

/** What to take from a file being imported. */
export const IMPORT_MODES = ['catalogue-only', 'catalogue-and-plan'] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];

export const IMPORT_MODE_LABELS: Readonly<Record<ImportMode, string>> = {
  'catalogue-only': 'Catalogue only — keep my current plan',
  'catalogue-and-plan': 'Catalogue and plan — replace everything',
};

export function serialiseAppState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readArray(
  source: Record<string, unknown>,
  key: string,
  log: IssueLog,
): unknown[] {
  const value = source[key];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    log.add(key, 'must be an array');
    return [];
  }
  return value;
}

function parsePileType(value: unknown, log: IssueLog): PileType | null {
  if (!isRecord(value)) {
    log.add('', 'must be an object');
    return null;
  }
  const {id, name, length, shaftRadius, mass, helices} = value;
  if (typeof id !== 'string' || !id) {
    log.add('id', 'must be a non-empty string');
    return null;
  }
  if (
    typeof length !== 'number' ||
    typeof shaftRadius !== 'number' ||
    typeof mass !== 'number'
  ) {
    log.add('', 'length, shaftRadius and mass must be numbers');
    return null;
  }
  const helixList = Array.isArray(helices) ? helices : [];
  const parsedHelices = helixList.flatMap(helix => {
    if (
      !isRecord(helix) ||
      typeof helix['offsetFromButt'] !== 'number' ||
      typeof helix['radius'] !== 'number' ||
      typeof helix['thickness'] !== 'number'
    ) {
      log.add(
        'helices',
        'each helix needs numeric offsetFromButt, radius and thickness',
      );
      return [];
    }
    return [
      {
        offsetFromButt: helix['offsetFromButt'],
        radius: helix['radius'],
        thickness: helix['thickness'],
      },
    ];
  });

  return {
    id,
    name: typeof name === 'string' && name ? name : id,
    length,
    shaftRadius,
    mass,
    helices: parsedHelices,
  };
}

function parseVehicle(value: unknown, log: IssueLog): Vehicle | null {
  if (!isRecord(value)) {
    log.add('', 'must be an object');
    return null;
  }
  // A version 1 file also carries `axles`. It is read and discarded — payload
  // capacity is the mass constraint now, so there is nothing to migrate.
  const {id, name, kind, deckLength, deckWidth, deckHeight, tare, maxGross} =
    value;
  if (typeof id !== 'string' || !id) {
    log.add('id', 'must be a non-empty string');
    return null;
  }
  if (
    typeof deckLength !== 'number' ||
    typeof deckWidth !== 'number' ||
    typeof deckHeight !== 'number' ||
    typeof tare !== 'number' ||
    typeof maxGross !== 'number'
  ) {
    log.add('', 'deck dimensions, tare and maxGross must be numbers');
    return null;
  }

  return {
    id,
    name: typeof name === 'string' && name ? name : id,
    kind: (typeof kind === 'string' ? kind : 'rigid') as Vehicle['kind'],
    deckLength,
    deckWidth,
    deckHeight,
    tare,
    maxGross,
  };
}

/**
 * Read a saved file. Tolerant about anything that can be defaulted, strict
 * about anything that would silently corrupt a plan.
 */
export function parseAppState(raw: string): Result<AppState> {
  const log = new IssueLog();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    log.add('file', `is not valid JSON (${(error as Error).message})`);
    return log.settle(emptyAppState(''));
  }

  if (!isRecord(parsed)) {
    log.add('file', 'must contain a JSON object');
    return log.settle(emptyAppState(''));
  }

  const formatVersion = parsed['formatVersion'];
  if (typeof formatVersion !== 'number') {
    log.add('formatVersion', 'is missing — this may not be a Pile-On file');
  } else if (formatVersion > STATE_FORMAT_VERSION) {
    log.add(
      'formatVersion',
      `is ${formatVersion}, but this build only reads up to ${STATE_FORMAT_VERSION}. Update Pile-On.`,
    );
  }

  const catalogueSource = isRecord(parsed['catalogue'])
    ? parsed['catalogue']
    : {};
  const pileTypes = readArray(
    catalogueSource,
    'pileTypes',
    log.child('catalogue'),
  )
    .map((value, index) =>
      parsePileType(value, log.child(`catalogue / pileTypes[${index}]`)),
    )
    .filter((type): type is PileType => type !== null);
  const vehicles = readArray(
    catalogueSource,
    'vehicles',
    log.child('catalogue'),
  )
    .map((value, index) =>
      parseVehicle(value, log.child(`catalogue / vehicles[${index}]`)),
    )
    .filter((vehicle): vehicle is Vehicle => vehicle !== null);

  const planSource = isRecord(parsed['plan']) ? parsed['plan'] : {};
  const plan: LoadPlan = {
    piles: readArray(
      planSource,
      'piles',
      log.child('plan'),
    ) as LoadPlan['piles'],
    consignments: readArray(
      planSource,
      'consignments',
      log.child('plan'),
    ) as LoadPlan['consignments'],
    placements: readArray(
      planSource,
      'placements',
      log.child('plan'),
    ) as LoadPlan['placements'],
  };

  return log.settle({
    formatVersion: STATE_FORMAT_VERSION,
    savedAt: typeof parsed['savedAt'] === 'string' ? parsed['savedAt'] : '',
    rulesetVersion:
      typeof parsed['rulesetVersion'] === 'string'
        ? parsed['rulesetVersion']
        : NZ_VDAM_2016.version,
    catalogue: {pileTypes, vehicles},
    plan,
  });
}

/** Apply an imported file to the current state according to the chosen mode. */
export function applyImport(
  current: AppState,
  imported: AppState,
  mode: ImportMode,
  now: string,
): AppState {
  if (mode === 'catalogue-and-plan') {
    return {...imported, savedAt: now};
  }
  return {
    ...current,
    savedAt: now,
    catalogue: imported.catalogue,
  };
}

/**
 * Placements and consignments pointing at catalogue entries that are no longer
 * there. Importing a catalogue over an existing plan is legitimate — a revised
 * price list, say — but it can orphan the plan, and the user needs telling
 * rather than discovering it at the loading bay.
 */
export function findDanglingReferences(state: AppState): Issue[] {
  const log = new IssueLog();
  const pileTypeIds = new Set(state.catalogue.pileTypes.map(type => type.id));
  const vehicleIds = new Set(
    state.catalogue.vehicles.map(vehicle => vehicle.id),
  );
  const pileIds = new Map(state.plan.piles.map(pile => [pile.id, pile]));

  for (const pile of state.plan.piles) {
    if (!pileTypeIds.has(pile.typeId)) {
      log.add(
        `plan / pile ${pile.id}`,
        `uses missing pile type "${pile.typeId}"`,
      );
    }
  }
  for (const consignment of state.plan.consignments) {
    if (!vehicleIds.has(consignment.vehicleId)) {
      log.add(
        `plan / consignment ${consignment.id}`,
        `uses missing vehicle "${consignment.vehicleId}"`,
      );
    }
  }
  for (const placement of state.plan.placements) {
    if (!pileIds.has(placement.pileId)) {
      log.add('plan / placements', `places unknown pile "${placement.pileId}"`);
    }
  }

  return [...log.all];
}
