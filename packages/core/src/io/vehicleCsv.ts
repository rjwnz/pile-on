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
 */
export const VEHICLE_CSV_HEADERS = [
  'id',
  'name',
  'kind',
  'deck_length',
  'deck_width',
  'deck_height',
  'tare',
  'max_gross',
] as const;

export const VEHICLE_CSV_EXAMPLE = `id,name,kind,deck_length,deck_width,deck_height,tare,max_gross
SEMI-45,Tractor + 4-axle semi,semi_trailer,12500,2450,1350,15800,44000
RIGID-8,8-wheeler rigid,rigid,7200,2450,1200,10600,30000
`;

export function parseVehicleRow(row: CsvRow, log: IssueLog): Vehicle {
  const id = readString(row, 'id', log);
  const name = readString(row, 'name', log, {required: false}) || id;
  const kind = readEnum<VehicleKind>(row, 'kind', VEHICLE_KINDS, log, 'rigid');
  const deckLength = readNumber(row, 'deck_length', log, {min: 1});
  const deckWidth = readNumber(row, 'deck_width', log, {min: 1});
  const deckHeight = readNumber(row, 'deck_height', log, {min: 0});
  const tare = readNumber(row, 'tare', log, {min: 0});
  const maxGross = readNumber(row, 'max_gross', log, {min: 1});

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
