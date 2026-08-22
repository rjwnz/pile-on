import {
  TYRE_CLASSES,
  VEHICLE_KINDS,
  type Axle,
  type TyreClass,
  type Vehicle,
  type VehicleKind,
} from '../domain/vehicle';
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
 * Axles go in one packed column rather than numbered columns like the helices.
 * A nine-axle B-train would need 36 columns to lay flat, and unlike the pile
 * catalogue there are only ever a handful of vehicles — so a compact, readable
 * cell beats a sheet nobody can scroll.
 *
 *     axles = position:tyre:set[:steer] | position:tyre:set[:steer] | …
 *     e.g.    0:SL:steer:steer|3550:T:drive|4870:T:drive|10100:T:tri
 *
 * Position is millimetres from the front of the vehicle.
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
  'axles',
] as const;

export const VEHICLE_CSV_EXAMPLE = `id,name,kind,deck_length,deck_width,deck_height,tare,max_gross,axles
SEMI-45,Tractor + 4-axle semi,semi_trailer,12500,2450,1350,15800,44000,0:SL:steer:steer|3550:T:drive|4870:T:drive|10100:T:tri|11400:T:tri
RIGID-8,8-wheeler rigid,rigid,7200,2450,1200,10600,30000,0:SL:steer:steer|1350:SL:steer:steer|4900:T:drive|6220:T:drive
`;

const AXLE_SEPARATOR = '|';
const FIELD_SEPARATOR = ':';

/** Parse the packed axle column. */
export function parseAxles(packed: string, log: IssueLog): Axle[] {
  const trimmed = packed.trim();
  if (!trimmed) {
    log.add('axles', 'is required');
    return [];
  }

  const axles: Axle[] = [];
  const specs = trimmed.split(AXLE_SEPARATOR);

  specs.forEach((spec, index) => {
    const parts = spec.split(FIELD_SEPARATOR).map(part => part.trim());
    const where = `axles / axle ${index + 1}`;

    if (parts.length < 3 || parts.length > 4) {
      log.add(
        where,
        `"${spec.trim()}" should be position:tyre:set or position:tyre:set:steer`,
      );
      return;
    }

    const [rawPosition, rawTyre, setId, rawSteer] = parts as [
      string,
      string,
      string,
      string | undefined,
    ];

    const xFromFront = Number(rawPosition);
    if (!Number.isFinite(xFromFront) || xFromFront < 0) {
      log.add(where, `position "${rawPosition}" is not a distance in mm`);
      return;
    }

    const tyreClass = TYRE_CLASSES.find(
      option => option.toLowerCase() === rawTyre.toLowerCase(),
    );
    if (!tyreClass) {
      log.add(
        where,
        `tyre class "${rawTyre}" is not one of ${TYRE_CLASSES.join(', ')}`,
      );
      return;
    }

    if (!setId) {
      log.add(where, 'axle set name is required');
      return;
    }

    if (rawSteer !== undefined && rawSteer.toLowerCase() !== 'steer') {
      log.add(where, `"${rawSteer}" should be "steer" or be left off`);
      return;
    }

    axles.push({
      xFromFront,
      tyreClass: tyreClass as TyreClass,
      setId,
      steering: rawSteer !== undefined,
    });
  });

  return axles.sort((a, b) => a.xFromFront - b.xFromFront);
}

export function parseVehicleRow(row: CsvRow, log: IssueLog): Vehicle {
  const id = readString(row, 'id', log);
  const name = readString(row, 'name', log, {required: false}) || id;
  const kind = readEnum<VehicleKind>(row, 'kind', VEHICLE_KINDS, log, 'rigid');
  const deckLength = readNumber(row, 'deck_length', log, {min: 1});
  const deckWidth = readNumber(row, 'deck_width', log, {min: 1});
  const deckHeight = readNumber(row, 'deck_height', log, {min: 0});
  const tare = readNumber(row, 'tare', log, {min: 0});
  const maxGross = readNumber(row, 'max_gross', log, {min: 1});
  const axles = parseAxles(row['axles'] ?? '', log);

  // How many axles a vehicle needs is a rule about vehicles, not about the
  // packed column. Only complain when some axles parsed but not enough — if
  // none parsed, the format error above is the actionable one.
  if (axles.length > 0 && axles.length < 2) {
    log.add('axles', 'a vehicle needs at least two axles');
  }

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
    axles,
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

/** Render axles back to the packed form, for CSV export and the edit form. */
export function formatAxles(axles: readonly Axle[]): string {
  return axles
    .map(axle =>
      [
        axle.xFromFront,
        axle.tyreClass,
        axle.setId,
        ...(axle.steering ? ['steer'] : []),
      ].join(FIELD_SEPARATOR),
    )
    .join(AXLE_SEPARATOR);
}
