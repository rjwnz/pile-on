/**
 * CSV shape for the pile type catalogue.
 *
 * A row is one shippable piece: a `pile_type` code (SP1, SP3) and a `part`,
 * either `starter` or `extension`. The starter carries the helices; extensions
 * are plain shaft, so their helix columns are ignored. The catalogue id is
 * built from the two — one pile type can list several extension lengths.
 *
 * Helices are flat, numbered columns (`helix1_diameter`, `helix2_diameter`, …)
 * rather than a packed string or a second file, because the people maintaining
 * this catalogue maintain it in Excel. The parser scans upward from 1 until it
 * finds no columns for the next index, so any number of helices works without
 * the format committing to a maximum.
 *
 * Shaft and plate sizes are entered as diameters — the figure stamped on the
 * pile — and halved to the radii the geometry works in.
 *
 * `helixN_length` was once called `helixN_thickness`. Both are accepted, so a
 * sheet written against the old header still imports.
 */

import {
  PILE_PARTS,
  pileId,
  pileName,
  type Helix,
  type PilePart,
  type PileType,
} from '../domain/pile';
import type {Millimetres} from '../units';
import {IssueLog, type Result} from '../validation/result';
import {
  readEnum,
  readNumber,
  readString,
  reportDuplicateIds,
  type CsvRow,
} from './fields';

/** Superseded by `helixN_length`; still read so old sheets keep importing. */
const LEGACY_LENGTH_SUFFIX = 'thickness';

export const PILE_TYPE_CSV_EXAMPLE = `pile_type,part,name,length,shaft_diameter,mass,helix1_offset,helix1_diameter,helix1_length,helix2_offset,helix2_diameter,helix2_length
SP1,starter,,6000,168,178,400,450,110,1100,350,110
SP1,extension,,3000,168,90,,,,,,
SP3,starter,,4500,140,96,350,350,90,,,
`;

function helixColumnsPresent(row: CsvRow, index: number): boolean {
  return ['offset', 'diameter', 'length', LEGACY_LENGTH_SUFFIX].some(part => {
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
    const diameter = readNumber(row, `${prefix}_diameter`, log, {min: 0.0001});
    const length = readHelixLength(row, index, log);
    helices.push({offsetFromButt, radius: diameter / 2, length});
  }

  return helices.sort((a, b) => a.offsetFromButt - b.offsetFromButt);
}

/** Map one CSV row to a pile type, collecting every problem it has. */
function parsePileTypeRow(row: CsvRow, log: IssueLog): PileType {
  const code = readString(row, 'pile_type', log);
  const part = readEnum<PilePart>(row, 'part', PILE_PARTS, log, 'starter');
  const name = readString(row, 'name', log, {required: false});
  const length = readNumber(row, 'length', log, {min: 1});
  const shaftDiameter = readNumber(row, 'shaft_diameter', log, {min: 1});
  const shaftRadius = shaftDiameter / 2;
  const mass = readNumber(row, 'mass', log, {min: 0.0001});
  // An extension is a plain shaft; any helix columns on its row are ignored.
  const helices = part === 'starter' ? readHelices(row, length, log) : [];

  for (const [index, helix] of helices.entries()) {
    if (helix.radius > 0 && helix.radius < shaftRadius) {
      log.add(
        `helix${index + 1}_diameter`,
        `is smaller than the shaft diameter (${shaftDiameter}) — check the units`,
      );
    }
  }

  return {
    id: pileId(code, part, length),
    name: name || pileName(code, part),
    length,
    shaftRadius,
    mass,
    helices,
  };
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
