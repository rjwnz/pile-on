import {describe, expect, it} from '@jest/globals';
import {IssueLog} from '../validation/result';
import {
  formatAxles,
  parseAxles,
  parseVehicleEntry,
  parseVehicleRows,
} from './vehicleCsv';
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
  axles: '0:SL:steer:steer|3550:T:drive|4870:T:drive|10100:T:tri',
};

function messages(result: ReturnType<typeof parseVehicleRows>): string[] {
  return result.ok ? [] : result.issues.map(i => `${i.path}: ${i.message}`);
}

describe('parseAxles', () => {
  function parse(packed: string) {
    const log = new IssueLog();
    const axles = parseAxles(packed, log);
    return {axles, issues: log.all.map(i => `${i.path}: ${i.message}`)};
  }

  it('reads position, tyre class and set', () => {
    const {axles, issues} = parse('3550:T:drive');

    expect(issues).toEqual([]);
    expect(axles).toEqual([
      {xFromFront: 3550, tyreClass: 'T', setId: 'drive', steering: false},
    ]);
  });

  it('reads the optional steer flag', () => {
    const {axles} = parse('0:SL:steer:steer|3550:T:drive');

    expect(axles[0]!.steering).toBe(true);
    expect(axles[1]!.steering).toBe(false);
  });

  it('accepts lower-case tyre classes', () => {
    expect(parse('0:sl:steer').axles[0]!.tyreClass).toBe('SL');
  });

  it('sorts axles front to back whatever order they are written in', () => {
    const {axles} = parse('10100:T:tri|0:SL:steer|3550:T:drive');

    expect(axles.map(a => a.xFromFront)).toEqual([0, 3550, 10100]);
  });

  it('requires the column', () => {
    expect(parse('   ').issues).toEqual(['axles: is required']);
  });

  it('rejects the wrong number of fields', () => {
    expect(parse('3550:T').issues).toEqual([
      'axles / axle 1: "3550:T" should be position:tyre:set or position:tyre:set:steer',
    ]);
  });

  it('rejects an unparseable position', () => {
    expect(parse('front:T:drive|1:T:drive').issues).toEqual([
      'axles / axle 1: position "front" is not a distance in mm',
    ]);
  });

  it('rejects an unknown tyre class', () => {
    expect(parse('0:XL:steer|1:T:drive').issues).toEqual([
      'axles / axle 1: tyre class "XL" is not one of S, SL, SM, T',
    ]);
  });

  it('rejects a missing set name', () => {
    expect(parse('0:T:|1:T:drive').issues).toEqual([
      'axles / axle 1: axle set name is required',
    ]);
  });

  it('rejects a fourth field that is not "steer"', () => {
    expect(parse('0:T:drive:yes|1:T:drive').issues).toEqual([
      'axles / axle 1: "yes" should be "steer" or be left off',
    ]);
  });

  it('round-trips through formatAxles', () => {
    expect(formatAxles(parse(GOOD['axles']!).axles)).toBe(GOOD['axles']);
  });
});

describe('parseVehicleRows', () => {
  it('maps a well-formed row', () => {
    const result = parseVehicleRows([GOOD]);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value[0]).toMatchObject({
      id: 'SEMI-45',
      kind: 'semi_trailer',
      deckLength: 12500,
      maxGross: 44000,
    });
    expect(result.ok && result.value[0]!.axles).toHaveLength(4);
  });

  it('rejects an empty file', () => {
    expect(messages(parseVehicleRows([]))).toEqual([
      'file: contains no data rows',
    ]);
  });

  it('requires the kind column and lists the options when it is blank', () => {
    expect(messages(parseVehicleRows([{...GOOD, kind: ''}]))).toEqual([
      'row 1 / kind: is required (one of rigid, semi_trailer, full_trailer, simple_trailer, b_train)',
    ]);
  });

  it('rejects a vehicle with only one valid axle', () => {
    expect(messages(parseVehicleRows([{...GOOD, axles: '0:T:drive'}]))).toEqual(
      ['row 1 / axles: a vehicle needs at least two axles'],
    );
  });

  it('rejects an unknown vehicle kind and lists the options', () => {
    expect(messages(parseVehicleRows([{...GOOD, kind: 'ute'}]))).toEqual([
      'row 1 / kind: "ute" is not one of rigid, semi_trailer, full_trailer, simple_trailer, b_train',
    ]);
  });

  it('rejects a gross mass that leaves no payload', () => {
    expect(messages(parseVehicleRows([{...GOOD, max_gross: '15000'}]))).toEqual(
      ['row 1 / max_gross: must exceed tare (15800), leaving no payload'],
    );
  });

  it('prefixes axle problems with the row', () => {
    expect(
      messages(parseVehicleRows([GOOD, {...GOOD, id: 'B', axles: 'nonsense'}])),
    ).toEqual([
      'row 2 / axles / axle 1: "nonsense" should be position:tyre:set or position:tyre:set:steer',
    ]);
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
