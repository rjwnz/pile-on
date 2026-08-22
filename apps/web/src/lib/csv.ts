import Papa from 'papaparse';
import type {CsvRow} from '@pile-on/core';

/** Where Papa parks cells from a row with more columns than headers. */
const SURPLUS_CELLS = '__parsed_extra';

/**
 * Text to rows — Papa's problem, not ours, trimming included. Delimiter
 * detection stays on because a block pasted from Excel arrives tab-separated.
 */
export function parseCsvText(text: string): CsvRow[] {
  const {data} = Papa.parse<CsvRow>(text.trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: header => header.trim().toLowerCase(),
    transform: value => value.trim(),
  });

  for (const row of data) {
    // A ragged row leaves an array behind under a key `CsvRow` promises is a
    // string. The parsers only read columns they know by name, so the surplus
    // is dropped here rather than defended against in every reader.
    if (SURPLUS_CELLS in row) {
      delete (row as Record<string, unknown>)[SURPLUS_CELLS];
    }
  }

  return data;
}
