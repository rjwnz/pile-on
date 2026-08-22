import type {IssueLog} from '../validation/result';

/** A parsed CSV row: header name to raw cell text. */
export type CsvRow = Readonly<Record<string, string>>;

/**
 * Field readers shared by the CSV mappers.
 *
 * Each one logs an issue and returns a fallback rather than throwing, so a
 * single bad row reports every one of its problems instead of just the first.
 */

export function readString(
  row: CsvRow,
  field: string,
  log: IssueLog,
  {required = true} = {},
): string {
  const raw = (row[field] ?? '').trim();
  if (!raw && required) {
    log.add(field, 'is required');
  }
  return raw;
}

export function readNumber(
  row: CsvRow,
  field: string,
  log: IssueLog,
  {
    min,
    max,
    required = true,
  }: {min?: number; max?: number; required?: boolean} = {},
): number {
  const raw = (row[field] ?? '').trim();
  if (!raw) {
    if (required) {
      log.add(field, 'is required');
    }
    return 0;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    log.add(field, `"${raw}" is not a number`);
    return 0;
  }
  if (min !== undefined && value < min) {
    log.add(field, `must be at least ${min}, got ${value}`);
  }
  if (max !== undefined && value > max) {
    log.add(field, `must be at most ${max}, got ${value}`);
  }
  return value;
}

export function readEnum<T extends string>(
  row: CsvRow,
  field: string,
  allowed: readonly T[],
  log: IssueLog,
  fallback: T,
): T {
  const raw = (row[field] ?? '').trim();
  if (!raw) {
    log.add(field, `is required (one of ${allowed.join(', ')})`);
    return fallback;
  }
  const match = allowed.find(
    option => option.toLowerCase() === raw.toLowerCase(),
  );
  if (!match) {
    log.add(field, `"${raw}" is not one of ${allowed.join(', ')}`);
    return fallback;
  }
  return match;
}

/** Flag ids that appear more than once in an import. */
export function reportDuplicateIds(
  ids: readonly string[],
  log: IssueLog,
  label = 'id',
): void {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (!id) {
      return;
    }
    if (seen.has(id)) {
      log.add(`row ${index + 1} / ${label}`, `"${id}" appears more than once`);
    }
    seen.add(id);
  });
}
