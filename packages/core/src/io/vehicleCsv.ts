import {VEHICLE_KINDS, type Vehicle, type VehicleKind} from '../domain/vehicle';
import {IssueLog, type Result} from '../validation/result';
import {
  readEnum,
  readNumber,
  readString,
  reportDuplicateIds,
  type CsvRow,
} from './fields';

/**
 * CSV shape for the vehicle catalogue.
 *
 * A vehicle is a deck and a mass limit. There is no axle column: the payload
 * limit is always reached before any axle limit here, so axle positions and
 * tyre classes were data nobody had to maintain and nothing consulted.
 *
 * The three loading columns are optional, and all three default to the
 * conservative reading — no overhang either end, balance point at mid-deck — so
 * a sheet written before they existed still imports and still means what it
 * meant. They cannot be derived: overhang limits are stated against axle
 * spacing, and where a deck wants its load depends on where its axles are.
 *
 * `towable_by` marks a trailer: the ids of the trucks allowed to tow it,
 * semicolon-separated (commas belong to the CSV). Blank means the row is a
 * self-propelled truck.
 */
export const VEHICLE_CSV_EXAMPLE = `id,name,kind,deck_length,deck_width,deck_height,tare,max_gross,max_front_overhang,max_rear_overhang,balance_target,towable_by
SEMI-45,Tractor + 4-axle semi,semi_trailer,12500,2450,1350,15800,44000,0,0,,
RIGID-8,8-wheeler rigid,rigid,7200,2450,1200,10600,30000,0,0,,
TRAILER-4A,4-axle full trailer,full_trailer,8100,2450,1150,6800,22000,0,0,,RIGID-8
`;

function parseVehicleRow(row: CsvRow, log: IssueLog): Vehicle {
  const id = readString(row, 'id', log);
  const name = readString(row, 'name', log, {required: false}) || id;
  const kind = readEnum<VehicleKind>(row, 'kind', VEHICLE_KINDS, log, 'rigid');
  const deckLength = readNumber(row, 'deck_length', log, {min: 1});
  const deckWidth = readNumber(row, 'deck_width', log, {min: 1});
  const deckHeight = readNumber(row, 'deck_height', log, {min: 0});
  const tare = readNumber(row, 'tare', log, {min: 0});
  const maxGross = readNumber(row, 'max_gross', log, {min: 1});
  const maxFrontOverhang = readNumber(row, 'max_front_overhang', log, {
    min: 0,
    required: false,
  });
  const maxRearOverhang = readNumber(row, 'max_rear_overhang', log, {
    min: 0,
    required: false,
  });
  const balanceTargetRaw = (row['balance_target'] ?? '').trim();
  const balanceTarget = balanceTargetRaw
    ? readNumber(row, 'balance_target', log, {min: 0, max: deckLength})
    : null;
  const towableBy = readString(row, 'towable_by', log, {required: false})
    .split(';')
    .map(entry => entry.trim())
    .filter(Boolean);

  if (maxGross > 0 && tare > 0 && maxGross <= tare) {
    log.add('max_gross', `must exceed tare (${tare}), leaving no payload`);
  }

  return {
    id,
    name,
    kind,
    deckLength,
    deckWidth,
    deckHeight,
    tare,
    maxGross,
    maxFrontOverhang,
    maxRearOverhang,
    balanceTarget,
    towableBy,
  };
}

/** Validate a single entry — shared by the manual form and CSV import. */
export function parseVehicleEntry(row: CsvRow): Result<Vehicle> {
  const log = new IssueLog();
  const vehicle = parseVehicleRow(row, log);
  return log.settle(vehicle);
}

export function parseVehicleRows(rows: readonly CsvRow[]): Result<Vehicle[]> {
  const log = new IssueLog();

  if (rows.length === 0) {
    log.add('file', 'contains no data rows');
    return log.settle([]);
  }

  const vehicles = rows.map((row, index) =>
    parseVehicleRow(row, log.child(`row ${index + 1}`)),
  );
  reportDuplicateIds(
    vehicles.map(vehicle => vehicle.id),
    log,
  );

  return log.settle(vehicles);
}
