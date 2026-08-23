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
 * `balance_target` is optional and defaults to mid-deck.
 *
 * `towable_by` marks a trailer: the ids of the trucks allowed to tow it,
 * semicolon-separated (commas belong to the CSV). Blank means the row is a
 * self-propelled truck.
 */
export const VEHICLE_CSV_EXAMPLE = `id,name,kind,deck_length,deck_width,payload_capacity,balance_target,towable_by
SEMI-45,Tractor + 4-axle semi,semi_trailer,12500,2450,28200,,
RIGID-8,8-wheeler rigid,rigid,7200,2450,19400,,
TRAILER-4A,4-axle full trailer,full_trailer,8100,2450,15200,,RIGID-8
`;

function parseVehicleRow(row: CsvRow, log: IssueLog): Vehicle {
  const id = readString(row, 'id', log);
  const name = readString(row, 'name', log, {required: false}) || id;
  const kind = readEnum<VehicleKind>(row, 'kind', VEHICLE_KINDS, log, 'rigid');
  const deckLength = readNumber(row, 'deck_length', log, {min: 1});
  const deckWidth = readNumber(row, 'deck_width', log, {min: 1});
  const payloadCapacity = readNumber(row, 'payload_capacity', log, {min: 1});
  const balanceTargetRaw = (row['balance_target'] ?? '').trim();
  const balanceTarget = balanceTargetRaw
    ? readNumber(row, 'balance_target', log, {min: 0, max: deckLength})
    : null;
  const towableBy = readString(row, 'towable_by', log, {required: false})
    .split(';')
    .map(entry => entry.trim())
    .filter(Boolean);

  return {
    id,
    name,
    kind,
    deckLength,
    deckWidth,
    payloadCapacity,
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
