import {describe, expect, it} from '@jest/globals';
import {parseJobRows} from './jobCsv';
import type {CsvRow} from './fields';

const KNOWN = new Set(['SP168-D6', 'SP139-S4']);

function rows(...entries: [string, string][]): CsvRow[] {
  return entries.map(([pile_type_id, quantity]) => ({pile_type_id, quantity}));
}

function messages(result: ReturnType<typeof parseJobRows>): string[] {
  return result.ok ? [] : result.issues.map(i => `${i.path}: ${i.message}`);
}

describe('parseJobRows', () => {
  it('maps well-formed rows', () => {
    const result = parseJobRows(
      rows(['SP168-D6', '120'], ['SP139-S4', '64']),
      KNOWN,
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual([
      {pileTypeId: 'SP168-D6', quantity: 120},
      {pileTypeId: 'SP139-S4', quantity: 64},
    ]);
  });

  it('rejects an empty file', () => {
    expect(messages(parseJobRows([], KNOWN))).toEqual([
      'file: contains no data rows',
    ]);
  });

  it('rejects a pile type that is not in the catalogue', () => {
    expect(messages(parseJobRows(rows(['SP999-X', '10']), KNOWN))).toEqual([
      'row 1 / pile_type_id: "SP999-X" is not in the pile type catalogue — import or add it first',
    ]);
  });

  it('rejects a fractional quantity', () => {
    expect(messages(parseJobRows(rows(['SP168-D6', '2.5']), KNOWN))).toEqual([
      'row 1 / quantity: must be a whole number of piles, got 2.5',
    ]);
  });

  it('rejects a negative quantity', () => {
    expect(messages(parseJobRows(rows(['SP168-D6', '-3']), KNOWN))).toEqual([
      'row 1 / quantity: must be at least 0, got -3',
    ]);
  });

  it('rejects a quantity that is not a number', () => {
    expect(messages(parseJobRows(rows(['SP168-D6', 'lots']), KNOWN))).toEqual([
      'row 1 / quantity: "lots" is not a number',
    ]);
  });

  it('requires both columns', () => {
    expect(messages(parseJobRows([{}], KNOWN))).toEqual([
      'row 1 / pile_type_id: is required',
      'row 1 / quantity: is required',
    ]);
  });

  it('sums repeated pile types rather than keeping only the last', () => {
    // Schedules routinely list a type once per building or grid line. Taking
    // the last would silently under-quote the job.
    const result = parseJobRows(
      rows(['SP168-D6', '40'], ['SP139-S4', '10'], ['SP168-D6', '80']),
      KNOWN,
    );

    expect(result.ok && result.value).toEqual([
      {pileTypeId: 'SP168-D6', quantity: 120},
      {pileTypeId: 'SP139-S4', quantity: 10},
    ]);
  });

  it('accepts a zero quantity without complaint', () => {
    const result = parseJobRows(rows(['SP168-D6', '0']), KNOWN);

    expect(result.ok && result.value).toEqual([
      {pileTypeId: 'SP168-D6', quantity: 0},
    ]);
  });

  it('reports every bad row, tagged with its row number', () => {
    expect(
      messages(
        parseJobRows(
          rows(['SP168-D6', '10'], ['NOPE', '5'], ['SP139-S4', 'x']),
          KNOWN,
        ),
      ),
    ).toEqual([
      'row 2 / pile_type_id: "NOPE" is not in the pile type catalogue — import or add it first',
      'row 3 / quantity: "x" is not a number',
    ]);
  });

  it('rejects everything when the catalogue is empty', () => {
    expect(
      messages(parseJobRows(rows(['SP168-D6', '10']), new Set())),
    ).toHaveLength(1);
  });
});
