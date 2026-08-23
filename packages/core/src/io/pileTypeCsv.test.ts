import {describe, expect, it} from '@jest/globals';
import {parsePileTypeEntry, parsePileTypeRows} from './pileTypeCsv';
import type {CsvRow} from './fields';

const GOOD: CsvRow = {
  pile_type: 'SP1',
  part: 'starter',
  name: 'SP1 twin helix',
  length: '6000',
  shaft_diameter: '168',
  mass: '178',
  helix1_offset: '400',
  helix1_diameter: '450',
  helix1_length: '110',
  helix2_offset: '1100',
  helix2_diameter: '350',
  helix2_length: '110',
};

function paths(result: ReturnType<typeof parsePileTypeRows>): string[] {
  return result.ok ? [] : result.issues.map(i => i.path);
}

function messages(result: ReturnType<typeof parsePileTypeRows>): string[] {
  return result.ok ? [] : result.issues.map(i => `${i.path}: ${i.message}`);
}

describe('parsePileTypeRows', () => {
  it('maps a well-formed row', () => {
    const result = parsePileTypeRows([GOOD]);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value[0]).toEqual({
      id: 'SP1-starter',
      name: 'SP1 twin helix',
      length: 6000,
      shaftRadius: 84,
      mass: 178,
      helices: [
        {offsetFromButt: 400, radius: 225, length: 110},
        {offsetFromButt: 1100, radius: 175, length: 110},
      ],
    });
  });

  it('builds an extension id from the length and drops its helix columns', () => {
    const result = parsePileTypeRows([
      {...GOOD, part: 'extension', name: '', length: '3000'},
    ]);

    expect(result.ok && result.value[0]).toMatchObject({
      id: 'SP1-ext-3000',
      name: 'SP1 extension',
      helices: [],
    });
  });

  it('rejects an empty file rather than silently importing nothing', () => {
    expect(messages(parsePileTypeRows([]))).toEqual([
      'file: contains no data rows',
    ]);
  });

  it('reads a single-helix pile and ignores the blank second helix columns', () => {
    const result = parsePileTypeRows([
      {
        ...GOOD,
        pile_type: 'SP3',
        helix2_offset: '',
        helix2_diameter: '',
        helix2_length: '',
      },
    ]);

    expect(result.ok && result.value[0]!.helices).toHaveLength(1);
  });

  it('handles any number of helices without a hard-coded maximum', () => {
    const result = parsePileTypeRows([
      {
        ...GOOD,
        helix3_offset: '2000',
        helix3_diameter: '300',
        helix3_length: '110',
      },
    ]);

    expect(result.ok && result.value[0]!.helices).toHaveLength(3);
  });

  it('sorts helices up the shaft regardless of column order', () => {
    const result = parsePileTypeRows([
      {
        ...GOOD,
        helix1_offset: '1100',
        helix2_offset: '400',
      },
    ]);

    expect(
      result.ok && result.value[0]!.helices.map(h => h.offsetFromButt),
    ).toEqual([400, 1100]);
  });

  it('falls back to a name built from the type and part when it is blank', () => {
    const result = parsePileTypeRows([{...GOOD, name: ''}]);

    expect(result.ok && result.value[0]!.name).toBe('SP1 starter');
  });

  it('reports every problem in a row, not just the first', () => {
    const result = parsePileTypeRows([
      {...GOOD, pile_type: '', length: 'six metres', mass: '-4'},
    ]);

    expect(messages(result)).toEqual([
      'row 1 / pile_type: is required',
      'row 1 / length: "six metres" is not a number',
      'row 1 / mass: must be at least 0.0001, got -4',
    ]);
  });

  it('tags issues with the row they came from', () => {
    const result = parsePileTypeRows([
      GOOD,
      {...GOOD, pile_type: 'SP2', shaft_diameter: ''},
      {...GOOD, pile_type: 'SP3', mass: 'heavy'},
    ]);

    expect(paths(result)).toEqual(['row 2 / shaft_diameter', 'row 3 / mass']);
  });

  it('rejects a part that is neither starter nor extension', () => {
    expect(messages(parsePileTypeRows([{...GOOD, part: 'middle'}]))).toContain(
      'row 1 / part: "middle" is not one of starter, extension',
    );
  });

  it('rejects a helix sitting off the end of the pile', () => {
    const result = parsePileTypeRows([{...GOOD, helix1_offset: '9000'}]);

    expect(messages(result)).toContain(
      'row 1 / helix1_offset: must be at most 6000, got 9000',
    );
  });

  it('catches a helix diameter below the shaft diameter as a likely unit error', () => {
    const result = parsePileTypeRows([{...GOOD, helix1_diameter: '90'}]);

    expect(messages(result)).toContain(
      'row 1 / helix1_diameter: is smaller than the shaft diameter (168) — check the units',
    );
  });

  it('flags a duplicated id, which would otherwise overwrite silently', () => {
    const result = parsePileTypeRows([GOOD, GOOD]);

    expect(messages(result)).toEqual([
      'row 2 / id: "SP1-starter" appears more than once',
    ]);
  });
});

describe('parsePileTypeEntry', () => {
  it('validates one entry, as the manual form does', () => {
    const result = parsePileTypeEntry(GOOD);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.helices).toHaveLength(2);
  });

  it('reports issues without any row prefix, since there is no row', () => {
    const result = parsePileTypeEntry({...GOOD, mass: ''});

    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues[0]!.path).toBe('mass');
  });

  it('still bounds a helix offset when the length is unusable', () => {
    // A bad length must not cascade into a bogus complaint per helix.
    const result = parsePileTypeEntry({...GOOD, length: 'oops'});

    expect(!result.ok && result.issues.map(i => i.path)).toEqual(['length']);
  });
});

describe('the old helix thickness column', () => {
  it('still imports, so existing catalogue sheets keep working', () => {
    const legacy = {
      ...GOOD,
      helix1_length: undefined as unknown as string,
      helix1_thickness: '110',
    };
    delete (legacy as Record<string, unknown>)['helix1_length'];
    const result = parsePileTypeRows([legacy]);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value[0]!.helices[0]!.length).toBe(110);
  });

  it('is overridden by the new column when a sheet carries both', () => {
    const result = parsePileTypeRows([
      {...GOOD, helix1_length: '150', helix1_thickness: '110'},
    ]);

    expect(result.ok && result.value[0]!.helices[0]!.length).toBe(150);
  });
});
