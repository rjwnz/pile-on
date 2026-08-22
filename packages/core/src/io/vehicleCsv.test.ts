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
      maxFrontOverhang: 0,
      maxRearOverhang: 0,
      balanceTarget: null,
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

describe('the loading columns', () => {
  it('reads overhang allowances and a stated balance target', () => {
    const result = parseVehicleEntry({
      ...GOOD,
      max_front_overhang: '300',
      max_rear_overhang: '1200',
      balance_target: '5400',
    });

    expect(result.ok && result.value.maxFrontOverhang).toBe(300);
    expect(result.ok && result.value.maxRearOverhang).toBe(1200);
    expect(result.ok && result.value.balanceTarget).toBe(5400);
  });

  it('takes a sheet written before they existed at its conservative word', () => {
    // No overhang either end, and no opinion about where the load should sit.
    const result = parseVehicleEntry(GOOD);

    expect(result.ok && result.value.maxFrontOverhang).toBe(0);
    expect(result.ok && result.value.maxRearOverhang).toBe(0);
    expect(result.ok && result.value.balanceTarget).toBeNull();
  });

  it('reads a blank balance target as unstated, not as the headboard', () => {
    const result = parseVehicleEntry({...GOOD, balance_target: '   '});

    expect(result.ok && result.value.balanceTarget).toBeNull();
  });

  it('rejects a balance target that is not on the deck', () => {
    expect(
      messages(parseVehicleRows([{...GOOD, balance_target: '13000'}])),
    ).toEqual(['row 1 / balance_target: must be at most 12500, got 13000']);
  });

  it('rejects a negative overhang allowance', () => {
    expect(
      messages(parseVehicleRows([{...GOOD, max_rear_overhang: '-100'}])),
    ).toEqual(['row 1 / max_rear_overhang: must be at least 0, got -100']);
  });
});
