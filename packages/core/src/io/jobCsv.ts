import type {JobLine} from '../domain/job';
import {IssueLog, type Result} from '../validation/result';
import {readNumber, readString, type CsvRow} from './fields';

/**
 * CSV shape for the piling schedule: a quantity per pile type.
 *
 * Unlike the catalogue importers this one needs to know the catalogue, because
 * a line naming a pile type nobody has defined is the single most likely thing
 * to be wrong with a schedule — and much cheaper to catch here than after
 * someone has quoted from it.
 */
export const JOB_CSV_EXAMPLE = `pile_type_id,quantity
SP168-D6,120
SP139-S4,64
`;

function parseJobRow(
  row: CsvRow,
  knownPileTypeIds: ReadonlySet<string>,
  log: IssueLog,
): JobLine {
  const pileTypeId = readString(row, 'pile_type_id', log);
  const quantity = readNumber(row, 'quantity', log, {min: 0});

  if (pileTypeId && !knownPileTypeIds.has(pileTypeId)) {
    log.add(
      'pile_type_id',
      `"${pileTypeId}" is not in the pile type catalogue — import or add it first`,
    );
  }
  if (Number.isFinite(quantity) && !Number.isInteger(quantity)) {
    log.add('quantity', `must be a whole number of piles, got ${quantity}`);
  }

  return {pileTypeId, quantity};
}

export function parseJobRows(
  rows: readonly CsvRow[],
  knownPileTypeIds: ReadonlySet<string>,
): Result<JobLine[]> {
  const log = new IssueLog();

  if (rows.length === 0) {
    log.add('file', 'contains no data rows');
    return log.settle([]);
  }

  const lines = rows.map((row, index) =>
    parseJobRow(row, knownPileTypeIds, log.child(`row ${index + 1}`)),
  );

  /*
   * A repeated pile type is summed rather than rejected. Schedules routinely
   * list the same type once per building or per grid line, and silently keeping
   * only the last one would under-quote the job.
   */
  const merged = new Map<string, number>();
  for (const line of lines) {
    merged.set(
      line.pileTypeId,
      (merged.get(line.pileTypeId) ?? 0) + line.quantity,
    );
  }

  return log.settle(
    [...merged].map(([pileTypeId, quantity]) => ({pileTypeId, quantity})),
  );
}
