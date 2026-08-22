import Papa from 'papaparse';
import type {CsvRow} from '@pile-on/core';

/**
 * Text to rows. Parsing CSV by hand is a classic way to lose an afternoon to
 * quoted commas and BOMs, so this is Papa's problem, not ours.
 *
 * Delimiter detection is left on because the realistic input is a block pasted
 * out of Excel, which arrives tab-separated.
 */
export function parseCsvText(text: string): CsvRow[] {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: header => header.trim().toLowerCase(),
  });

  return parsed.data.map(row =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, (value ?? '').trim()]),
    ),
  );
}

export function readFileText(file: File): Promise<string> {
  return file.text();
}
