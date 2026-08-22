import {
  EMPTY_CATALOGUE,
  EMPTY_PLAN,
  type Catalogue,
  type Consignment,
  type LoadPlan,
} from '../domain/catalogue';
import {EMPTY_JOB, type Job, type JobLine} from '../domain/job';
import type {PileType} from '../domain/pile';
import type {Placement} from '../domain/placement';
import type {Vehicle} from '../domain/vehicle';
import {NZ_VDAM_2016} from '../rules/nzVdam';
import {IssueLog, type Issue, type Result} from '../validation/result';

/**
 * Bump when a change to the shape cannot be read by the previous reader.
 * Adding an optional field does not need a bump; renaming or removing does.
 *
 * 2 — dropped `vehicle.axles`. Version 1 files still read cleanly: the axle
 *     data is simply ignored, and nothing else about the shape changed.
 * 3 — added `job` (quantity per pile type); dropped `plan.piles` and changed
 *     `placement.pileId` to `placement.pileTypeId` plus its own `id`. Version 2
 *     files read cleanly: they have no job, and in practice no placements
 *     either, since nothing produced them.
 * 4 — placements gained `consignmentId`; without it a plan cannot say which
 *     truck a pile rides on. No version 3 file has placements either, since
 *     the arranger did not exist yet.
 */
export const STATE_FORMAT_VERSION = 4;

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
  readonly job: Job;
  readonly plan: LoadPlan;
}

export function emptyAppState(now: string): AppState {
  return {
    formatVersion: STATE_FORMAT_VERSION,
    savedAt: now,
    rulesetVersion: NZ_VDAM_2016.version,
    catalogue: EMPTY_CATALOGUE,
    job: EMPTY_JOB,
    plan: EMPTY_PLAN,
  };
}

/** What to take from a file being imported. */
export const IMPORT_MODES = ['catalogue-only', 'catalogue-and-plan'] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];

export const IMPORT_MODE_LABELS: Readonly<Record<ImportMode, string>> = {
  'catalogue-only': 'Catalogue only — keep my current schedule and plan',
  'catalogue-and-plan': 'Everything — catalogue, schedule and plan',
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

function parseJobLine(value: unknown, log: IssueLog): JobLine | null {
  if (!isRecord(value)) {
    log.add('', 'must be an object');
    return null;
  }
  const {pileTypeId, quantity} = value;
  if (typeof pileTypeId !== 'string' || !pileTypeId) {
    log.add('pileTypeId', 'must be a non-empty string');
    return null;
  }
  if (
    typeof quantity !== 'number' ||
    !Number.isInteger(quantity) ||
    quantity < 0
  ) {
    log.add('quantity', 'must be a whole number of piles, zero or more');
    return null;
  }
  return {pileTypeId, quantity};
}

function parseConsignment(value: unknown, log: IssueLog): Consignment | null {
  if (!isRecord(value)) {
    log.add('', 'must be an object');
    return null;
  }
  const {id, vehicleId, phase} = value;
  if (
    typeof id !== 'string' ||
    !id ||
    typeof vehicleId !== 'string' ||
    !vehicleId
  ) {
    log.add('', 'needs a non-empty id and vehicleId');
    return null;
  }
  return {id, vehicleId, phase: typeof phase === 'string' ? phase : null};
}

/**
 * Placements before version 4 lacked `consignmentId` (and before version 3
 * carried `pileId` instead of `pileTypeId`). Those are dropped with an issue
 * rather than guessed at — in practice no such file has any, because nothing
 * produced placements before the arranger.
 */
function parsePlacement(value: unknown, log: IssueLog): Placement | null {
  if (!isRecord(value)) {
    log.add('', 'must be an object');
    return null;
  }
  const {id, consignmentId, pileTypeId, tier, x, y, flipped} = value;
  if (
    typeof id !== 'string' ||
    !id ||
    typeof consignmentId !== 'string' ||
    !consignmentId ||
    typeof pileTypeId !== 'string' ||
    !pileTypeId
  ) {
    log.add('', 'needs a non-empty id, consignmentId and pileTypeId');
    return null;
  }
  if (
    typeof tier !== 'number' ||
    typeof x !== 'number' ||
    typeof y !== 'number'
  ) {
    log.add('', 'tier, x and y must be numbers');
    return null;
  }
  return {id, consignmentId, pileTypeId, tier, x, y, flipped: flipped === true};
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

  const jobSource = isRecord(parsed['job']) ? parsed['job'] : {};
  const job: Job = {
    name: typeof jobSource['name'] === 'string' ? jobSource['name'] : '',
    lines: readArray(jobSource, 'lines', log.child('job'))
      .map((value, index) =>
        parseJobLine(value, log.child(`job / lines[${index}]`)),
      )
      .filter((line): line is JobLine => line !== null),
  };

  const planSource = isRecord(parsed['plan']) ? parsed['plan'] : {};
  const plan: LoadPlan = {
    consignments: readArray(planSource, 'consignments', log.child('plan'))
      .map((value, index) =>
        parseConsignment(value, log.child(`plan / consignments[${index}]`)),
      )
      .filter((entry): entry is Consignment => entry !== null),
    placements: readArray(planSource, 'placements', log.child('plan'))
      .map((value, index) =>
        parsePlacement(value, log.child(`plan / placements[${index}]`)),
      )
      .filter((entry): entry is Placement => entry !== null),
  };

  return log.settle({
    formatVersion: STATE_FORMAT_VERSION,
    savedAt: typeof parsed['savedAt'] === 'string' ? parsed['savedAt'] : '',
    rulesetVersion:
      typeof parsed['rulesetVersion'] === 'string'
        ? parsed['rulesetVersion']
        : NZ_VDAM_2016.version,
    catalogue: {pileTypes, vehicles},
    job,
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
  // Catalogue only: the job and plan being worked on are left alone.
  return {
    ...current,
    savedAt: now,
    catalogue: imported.catalogue,
  };
}

/**
 * Job lines, placements and consignments pointing at catalogue entries that are
 * no longer there. Importing a catalogue over an existing job is legitimate — a
 * revised price list, say — but it can orphan the job, and the user needs
 * telling rather than discovering it at the loading bay.
 */
export function findDanglingReferences(state: AppState): Issue[] {
  const log = new IssueLog();
  const pileTypeIds = new Set(state.catalogue.pileTypes.map(type => type.id));
  const vehicleIds = new Set(
    state.catalogue.vehicles.map(vehicle => vehicle.id),
  );

  for (const line of state.job.lines) {
    if (!pileTypeIds.has(line.pileTypeId)) {
      log.add(
        'job',
        `needs ${line.quantity} of missing pile type "${line.pileTypeId}"`,
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
    if (!pileTypeIds.has(placement.pileTypeId)) {
      log.add(
        `plan / placement ${placement.id}`,
        `places missing pile type "${placement.pileTypeId}"`,
      );
    }
  }

  return [...log.all];
}
