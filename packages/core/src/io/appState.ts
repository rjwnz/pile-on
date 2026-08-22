import {
  EMPTY_CATALOGUE,
  EMPTY_PLAN,
  type Catalogue,
  type Consignment,
  type LoadPlan,
} from '../domain/catalogue';
import {EMPTY_JOB, type Job, type JobLine} from '../domain/job';
import {type BalanceTolerance, type ClearanceOptions} from '../domain/loading';
import {DEFAULT_PACKING_OPTIONS, type PackingOptions} from '../solver/options';
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
 * 5 — `helix.thickness` became `helix.length`, which is what it always meant.
 *     Version 4 files read cleanly: the old field is still accepted.
 * 6 — added `options` (how the yard loads, and what makes a load legal), and
 *     vehicles gained overhang allowances and a balance target. Version 5 files
 *     read cleanly: every one of those defaults to the conservative reading, so
 *     an old file means exactly what it meant.
 * 7 — vehicles gained `towableBy`, consignments `trailerId`, placements
 *     `deck`. Bumped although every field defaults, because a version-6 reader
 *     would fold a trailer's load onto the truck deck and re-judge the plan
 *     wrongly — the one thing tolerance must not do. Version 6 files read
 *     cleanly: no vehicle tows, no consignment has a trailer, every placement
 *     is on the truck deck, and the file means exactly what it meant.
 */
export const STATE_FORMAT_VERSION = 7;

export interface AppState {
  readonly formatVersion: number;
  readonly savedAt: string;
  /**
   * Which VDAM ruleset produced this. NZ transport limits move — NZTA removed
   * 50MAX permits in August 2026 — so a quote has to record the rules it was
   * priced under or it cannot be explained six months later.
   */
  readonly rulesetVersion: string;
  /**
   * The clearances, margins and tolerances this plan was built and checked
   * under.
   *
   * Saved for the same reason as `rulesetVersion`, and it matters just as much:
   * a quote priced at a 25 mm helix clearance and a 200 mm balance tolerance
   * cannot be re-explained six months later unless the file says so.
   */
  readonly options: PackingOptions;
  readonly catalogue: Catalogue;
  readonly job: Job;
  readonly plan: LoadPlan;
}

export function emptyAppState(now: string): AppState {
  return {
    formatVersion: STATE_FORMAT_VERSION,
    savedAt: now,
    rulesetVersion: NZ_VDAM_2016.version,
    options: DEFAULT_PACKING_OPTIONS,
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
    // `length` was `thickness` before version 5; old files still read.
    const axial =
      isRecord(helix) && typeof helix['length'] === 'number'
        ? helix['length']
        : isRecord(helix) && typeof helix['thickness'] === 'number'
          ? helix['thickness']
          : undefined;
    if (
      !isRecord(helix) ||
      typeof helix['offsetFromButt'] !== 'number' ||
      typeof helix['radius'] !== 'number' ||
      axial === undefined
    ) {
      log.add(
        'helices',
        'each helix needs numeric offsetFromButt, radius and length',
      );
      return [];
    }
    return [
      {
        offsetFromButt: helix['offsetFromButt'],
        radius: helix['radius'],
        length: axial,
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

/** A number if it is one, otherwise the fallback. Used for defaultable fields. */
function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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
    // Absent before version 6. Zero overhang and an unstated balance target are
    // the readings that leave an old file meaning what it meant.
    maxFrontOverhang: numberOr(value['maxFrontOverhang'], 0),
    maxRearOverhang: numberOr(value['maxRearOverhang'], 0),
    balanceTarget:
      typeof value['balanceTarget'] === 'number' &&
      Number.isFinite(value['balanceTarget'])
        ? value['balanceTarget']
        : null,
    // Absent before version 7: nothing towed, so nothing tows.
    towableBy: Array.isArray(value['towableBy'])
      ? value['towableBy'].filter(
          (entry): entry is string => typeof entry === 'string' && entry !== '',
        )
      : [],
  };
}

/**
 * Loading options, every field defaultable.
 *
 * Absent before version 6, so this has to read `{}` as "the defaults" without
 * complaint. It is deliberately tolerant rather than strict: an option missing
 * from a file is a version gap, not corruption, and refusing to open the file
 * over it would strand a saved quote.
 */
function parseLoadingOptions(value: unknown): PackingOptions {
  const source = isRecord(value) ? value : {};
  const defaults = DEFAULT_PACKING_OPTIONS;

  const clearanceSource = isRecord(source['clearances'])
    ? source['clearances']
    : {};
  const clearances: ClearanceOptions = {
    shaftToShaft: numberOr(
      clearanceSource['shaftToShaft'],
      defaults.clearances.shaftToShaft,
    ),
    helixToShaft: numberOr(
      clearanceSource['helixToShaft'],
      defaults.clearances.helixToShaft,
    ),
    helixToHelix: numberOr(
      clearanceSource['helixToHelix'],
      defaults.clearances.helixToHelix,
    ),
  };

  const balanceSource = isRecord(source['balance']) ? source['balance'] : {};
  const balance: BalanceTolerance = {
    longitudinal: numberOr(
      balanceSource['longitudinal'],
      defaults.balance.longitudinal,
    ),
    lateral: numberOr(balanceSource['lateral'], defaults.balance.lateral),
  };

  return {
    clearances,
    balance,
    dunnageThickness: numberOr(
      source['dunnageThickness'],
      defaults.dunnageThickness,
    ),
    endGap: numberOr(source['endGap'], defaults.endGap),
    sideMargin: numberOr(source['sideMargin'], defaults.sideMargin),
    headboardGap: numberOr(source['headboardGap'], defaults.headboardGap),
    maxTiers: numberOr(source['maxTiers'], defaults.maxTiers),
    ancillaryMassPerTier: numberOr(
      source['ancillaryMassPerTier'],
      defaults.ancillaryMassPerTier,
    ),
    // Added with the packer, so a version 6 file written before it has none.
    allowFlips:
      typeof source['allowFlips'] === 'boolean'
        ? source['allowFlips']
        : defaults.allowFlips,
    beamWidth: numberOr(source['beamWidth'], defaults.beamWidth),
    maxLanePatterns: numberOr(
      source['maxLanePatterns'],
      defaults.maxLanePatterns,
    ),
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
  const {id, vehicleId, trailerId, phase} = value;
  if (
    typeof id !== 'string' ||
    !id ||
    typeof vehicleId !== 'string' ||
    !vehicleId
  ) {
    log.add('', 'needs a non-empty id and vehicleId');
    return null;
  }
  return {
    id,
    vehicleId,
    // Absent before version 7: every movement was a truck running solo.
    trailerId: typeof trailerId === 'string' && trailerId ? trailerId : null,
    phase: typeof phase === 'string' ? phase : null,
  };
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
  const {id, consignmentId, deck, pileTypeId, tier, x, y, flipped} = value;
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
  return {
    id,
    consignmentId,
    // Absent before version 7, when the truck deck was the only deck.
    deck: deck === 'trailer' ? 'trailer' : 'truck',
    pileTypeId,
    tier,
    x,
    y,
    flipped: flipped === true,
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
    options: parseLoadingOptions(parsed['options']),
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
  // Catalogue only: the job and plan being worked on are left alone, and so are
  // the options — they are what the plan in progress is being checked against,
  // so importing someone else's would silently re-judge work already done.
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
  for (const vehicle of state.catalogue.vehicles) {
    for (const truckId of vehicle.towableBy) {
      if (!vehicleIds.has(truckId)) {
        log.add(
          `catalogue / vehicle ${vehicle.id}`,
          `is towable by missing vehicle "${truckId}"`,
        );
      }
    }
  }
  for (const consignment of state.plan.consignments) {
    if (!vehicleIds.has(consignment.vehicleId)) {
      log.add(
        `plan / consignment ${consignment.id}`,
        `uses missing vehicle "${consignment.vehicleId}"`,
      );
    }
    if (consignment.trailerId && !vehicleIds.has(consignment.trailerId)) {
      log.add(
        `plan / consignment ${consignment.id}`,
        `tows missing trailer "${consignment.trailerId}"`,
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
