import {describe, expect, it} from '@jest/globals';
import {parseVehicleEntry, parseVehicleRows} from './vehicleCsv';
import type {CsvRow} from './fields';

const GOOD: CsvRow = {
  id: 'SEMI-45',
  name: 'Tractor + 4-axle semi',
  kind: 'semi_trailer',
  deck_length: '12500',
  deck_width: '2450',
  deck_height: '1350',
  tare: '15800',
  max_gross: '44000',
};

function messages(result: ReturnType<typeof parseVehicleRows>): string[] {
  return result.ok ? [] : result.issues.map(i => `${i.path}: ${i.message}`);
}

describe('parseVehicleRows', () => {
  it('maps a well-formed row', () => {
    const result = parseVehicleRows([GOOD]);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value[0]).toEqual({
      id: 'SEMI-45',
      name: 'Tractor + 4-axle semi',
      kind: 'semi_trailer',
      deckLength: 12500,
      deckWidth: 2450,
      deckHeight: 1350,
      tare: 15800,
      maxGross: 44000,
    });
  });

  it('ignores a leftover axles column from an older export', () => {
    const result = parseVehicleRows([
      {...GOOD, axles: '0:SL:steer|3550:T:drive'},
    ]);

    expect(result.ok).toBe(true);
    expect(result.ok && Object.keys(result.value[0]!)).not.toContain('axles');
  });

  it('rejects an empty file', () => {
    expect(messages(parseVehicleRows([]))).toEqual([
      'file: contains no data rows',
    ]);
  });

  it('falls back to the id when the name is blank', () => {
    const result = parseVehicleRows([{...GOOD, name: ''}]);

    expect(result.ok && result.value[0]!.name).toBe('SEMI-45');
  });

  it('requires the kind column and lists the options when it is blank', () => {
    expect(messages(parseVehicleRows([{...GOOD, kind: ''}]))).toEqual([
      'row 1 / kind: is required (one of rigid, semi_trailer, full_trailer, simple_trailer, b_train)',
    ]);
  });

  it('rejects an unknown vehicle kind and lists the options', () => {
    expect(messages(parseVehicleRows([{...GOOD, kind: 'ute'}]))).toEqual([
      'row 1 / kind: "ute" is not one of rigid, semi_trailer, full_trailer, simple_trailer, b_train',
    ]);
  });

  it('accepts a kind in any case', () => {
    const result = parseVehicleRows([{...GOOD, kind: 'Semi_Trailer'}]);

    expect(result.ok && result.value[0]!.kind).toBe('semi_trailer');
  });

  it('rejects a gross mass that leaves no payload', () => {
    expect(messages(parseVehicleRows([{...GOOD, max_gross: '15000'}]))).toEqual(
      ['row 1 / max_gross: must exceed tare (15800), leaving no payload'],
    );
  });

  it('reports every problem in a row, not just the first', () => {
    expect(
      messages(
        parseVehicleRows([{...GOOD, id: '', deck_length: 'long', tare: ''}]),
      ),
    ).toEqual([
      'row 1 / id: is required',
      'row 1 / deck_length: "long" is not a number',
      'row 1 / tare: is required',
    ]);
  });

  it('tags issues with the row they came from', () => {
    expect(
      messages(parseVehicleRows([GOOD, {...GOOD, id: 'B', max_gross: ''}])),
    ).toEqual(['row 2 / max_gross: is required']);
  });

  it('flags duplicate ids', () => {
    expect(messages(parseVehicleRows([GOOD, GOOD]))).toEqual([
      'row 2 / id: "SEMI-45" appears more than once',
    ]);
  });
});

describe('parseVehicleEntry', () => {
  it('validates one entry, as the manual form does', () => {
    const result = parseVehicleEntry(GOOD);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.id).toBe('SEMI-45');
  });

  it('reports issues without any row prefix, since there is no row', () => {
    const result = parseVehicleEntry({...GOOD, id: ''});

    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues[0]!.path).toBe('id');
  });
});
