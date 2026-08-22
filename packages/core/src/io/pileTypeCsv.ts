import type {Helix, PileType} from '../domain/pile';
import type {Millimetres} from '../units';
import {IssueLog, type Result} from '../validation/result';
import {
  readNumber,
  readString,
  reportDuplicateIds,
  type CsvRow,
} from './fields';

/**
 * CSV shape for the pile type catalogue.
 *
 * Helices are flat, numbered columns (`helix1_radius`, `helix2_radius`, …)
 * rather than a packed string or a second file, because the people maintaining
 * this catalogue maintain it in Excel. The parser scans upward from 1 until it
 * finds no columns for the next index, so any number of helices works without
 * the format committing to a maximum.
 *
 * `helixN_length` was once called `helixN_thickness`. Both are accepted, so a
 * sheet written against the old header still imports.
 */
export const PILE_TYPE_CSV_HEADERS = [
  'id',
  'name',
  'length',
  'shaft_radius',
  'mass',
  'helix1_offset',
  'helix1_radius',
  'helix1_length',
  'helix2_offset',
  'helix2_radius',
  'helix2_length',
] as const;

/** Superseded by `helixN_length`; still read so old sheets keep importing. */
const LEGACY_LENGTH_SUFFIX = 'thickness';

export const PILE_TYPE_CSV_EXAMPLE = `id,name,length,shaft_radius,mass,helix1_offset,helix1_radius,helix1_length,helix2_offset,helix2_radius,helix2_length
SP168-D6,SP168 6.0 m twin helix,6000,84,178,400,225,110,1100,175,110
SP139-S4,SP139 4.5 m single helix,4500,70,96,350,175,90,,,
`;

function helixColumnsPresent(row: CsvRow, index: number): boolean {
  return ['offset', 'radius', 'length', LEGACY_LENGTH_SUFFIX].some(part => {
    const value = row[`helix${index}_${part}`];
    return value !== undefined && value.trim() !== '';
  });
}

/** Read `helixN_length`, falling back to the old `helixN_thickness` column. */
function readHelixLength(
  row: CsvRow,
  index: number,
  log: IssueLog,
): Millimetres {
  const legacy = row[`helix${index}_${LEGACY_LENGTH_SUFFIX}`];
  const field =
    row[`helix${index}_length`] === undefined && legacy !== undefined
      ? `helix${index}_${LEGACY_LENGTH_SUFFIX}`
      : `helix${index}_length`;
  return readNumber(row, field, log, {min: 0});
}

function readHelices(row: CsvRow, pileLength: number, log: IssueLog): Helix[] {
  const helices: Helix[] = [];

  // Stop at the first index with no data, but keep going past a gap in the
  // column set so a sparse sheet does not silently drop a helix.
  const maxIndex = Object.keys(row).reduce((highest, key) => {
    const match = /^helix(\d+)_/.exec(key);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);

  for (let index = 1; index <= maxIndex; index++) {
    if (!helixColumnsPresent(row, index)) {
      continue;
    }
    const prefix = `helix${index}`;
    // Only bound the offset by the pile length if that parsed — one bad length
    // column should not cascade into a bogus complaint per helix.
    const offsetFromButt = readNumber(row, `${prefix}_offset`, log, {
      min: 0,
      ...(pileLength > 0 ? {max: pileLength} : {}),
    });
    const radius = readNumber(row, `${prefix}_radius`, log, {min: 0.0001});
    const length = readHelixLength(row, index, log);
    helices.push({offsetFromButt, radius, length});
  }

  return helices.sort((a, b) => a.offsetFromButt - b.offsetFromButt);
}

/** Map one CSV row to a pile type, collecting every problem it has. */
export function parsePileTypeRow(row: CsvRow, log: IssueLog): PileType {
  const id = readString(row, 'id', log);
  const name = readString(row, 'name', log, {required: false}) || id;
  const length = readNumber(row, 'length', log, {min: 1});
  const shaftRadius = readNumber(row, 'shaft_radius', log, {min: 1});
  const mass = readNumber(row, 'mass', log, {min: 0.0001});
  const helices = readHelices(row, length, log);

  for (const [index, helix] of helices.entries()) {
    if (helix.radius > 0 && helix.radius < shaftRadius) {
      log.add(
        `helix${index + 1}_radius`,
        `is smaller than the shaft radius (${shaftRadius}) — check the units`,
      );
    }
  }

  return {id, name, length, shaftRadius, mass, helices};
}

/**
 * Validate a single entry. The manual entry form calls this with a row it has
 * built from its own fields, so hand-typed and imported data go through exactly
 * the same rules — there is no second, weaker validator hiding in the UI.
 */
export function parsePileTypeEntry(row: CsvRow): Result<PileType> {
  const log = new IssueLog();
  const type = parsePileTypeRow(row, log);
  return log.settle(type);
}

export function parsePileTypeRows(rows: readonly CsvRow[]): Result<PileType[]> {
  const log = new IssueLog();

  if (rows.length === 0) {
    log.add('file', 'contains no data rows');
    return log.settle([]);
  }

  const types = rows.map((row, index) =>
    parsePileTypeRow(row, log.child(`row ${index + 1}`)),
  );
  reportDuplicateIds(
    types.map(type => type.id),
    log,
  );

  return log.settle(types);
}
