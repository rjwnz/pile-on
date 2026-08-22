import {describe, expect, it} from '@jest/globals';
import {flipVariants, lanePatterns, patternDemand} from './lane';
import {DEFAULT_LOADING_OPTIONS} from '../domain/loading';
import type {Catalogue} from '../domain/catalogue';
import type {PileType} from '../domain/pile';

const LONG: PileType = {
  id: 'LONG',
  name: 'Six metre',
  length: 6000,
  shaftRadius: 84,
  mass: 178,
  helices: [{offsetFromButt: 400, radius: 225, length: 110}],
};

const SHORT: PileType = {
  id: 'SHORT',
  name: 'Four and a half metre',
  length: 4500,
  shaftRadius: 70,
  mass: 96,
  helices: [{offsetFromButt: 350, radius: 175, length: 90}],
};

const CATALOGUE: Catalogue = {pileTypes: [LONG, SHORT], vehicles: []};
const OPTIONS = DEFAULT_LOADING_OPTIONS;
const SPAN = 12400;
const START = 100;

function patterns(
  available: [string, number][],
  extra: {limit?: number; maxHalfWidth?: number} = {},
) {
  return lanePatterns(
    new Map(available),
    CATALOGUE,
    SPAN,
    START,
    OPTIONS,
    extra,
  );
}

function shape(pattern: {slots: readonly {pileTypeId: string}[]}): string {
  return pattern.slots.map(slot => slot.pileTypeId).join('+');
}

describe('lanePatterns', () => {
  it('lays piles nose to tail with the end gap between them', () => {
    const [fullest] = patterns([['LONG', 4]]);

    expect(fullest!.slots.map(slot => slot.x)).toEqual([100, 6200]);
    expect(fullest!.used).toBe(12100);
    expect(fullest!.slack).toBe(300);
  });

  it('puts the fullest lane first', () => {
    expect(shape(patterns([['LONG', 4]])[0]!)).toBe('LONG+LONG');
  });

  it('mixes lengths, which is deck a single-length lane would waste', () => {
    // Two 4.5 m piles leave 3.3 m of deck doing nothing. A 6 m behind a 4.5 m
    // uses 10.6 m of the 12.4 m available.
    const mixed = patterns([
      ['LONG', 4],
      ['SHORT', 4],
    ]).map(shape);

    expect(mixed).toContain('LONG+SHORT');
  });

  it('never asks for more of a type than is left', () => {
    for (const pattern of patterns([
      ['LONG', 1],
      ['SHORT', 1],
    ])) {
      expect(patternDemand(pattern).get('LONG') ?? 0).toBeLessThanOrEqual(1);
      expect(patternDemand(pattern).get('SHORT') ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the emptier lanes too, because slack is what buys a stagger', () => {
    const shapes = patterns([['LONG', 4]]).map(shape);

    expect(shapes).toContain('LONG+LONG');
    expect(shapes).toContain('LONG');
  });

  it('leaves out anything wider than the tier will take', () => {
    const shapes = patterns(
      [
        ['LONG', 4],
        ['SHORT', 4],
      ],
      {maxHalfWidth: 175},
    ).map(shape);

    expect(shapes.every(name => !name.includes('LONG'))).toBe(true);
    expect(shapes).toContain('SHORT+SHORT');
  });

  it('reports the widest radius in the pattern, which is what the lane costs', () => {
    const [widest] = patterns([
      ['LONG', 1],
      ['SHORT', 4],
    ]);

    expect(widest!.halfWidth).toBe(225);
  });

  it('totals the mass it would consume', () => {
    const [fullest] = patterns([['LONG', 4]]);

    expect(fullest!.mass).toBe(356);
  });

  it('gives nothing back when nothing fits the deck', () => {
    const huge: Catalogue = {
      pileTypes: [{...LONG, id: 'HUGE', length: 20000}],
      vehicles: [],
    };

    expect(
      lanePatterns(new Map([['HUGE', 4]]), huge, SPAN, START, OPTIONS),
    ).toEqual([]);
  });

  it('gives nothing back when there is no demand', () => {
    expect(patterns([['LONG', 0]])).toEqual([]);
  });

  it('honours the cap on how many it keeps', () => {
    expect(
      patterns(
        [
          ['LONG', 6],
          ['SHORT', 6],
        ],
        {limit: 3},
      ),
    ).toHaveLength(3);
  });
});

describe('flipVariants', () => {
  it('enumerates every combination for a short lane', () => {
    const [pattern] = patterns([['LONG', 4]]);

    expect(flipVariants(pattern!, true)).toHaveLength(4);
  });

  it('offers only the pattern as laid when flipping is off', () => {
    const [pattern] = patterns([['LONG', 4]]);
    const variants = flipVariants(pattern!, false);

    expect(variants).toHaveLength(1);
    expect(variants[0]!.slots.every(slot => !slot.flipped)).toBe(true);
  });

  it('falls back to blanket assignments once a lane is long', () => {
    const many = {
      slots: Array.from({length: 6}, (_, index) => ({
        pileTypeId: 'LONG',
        x: index * 1000,
        flipped: false,
      })),
      slack: 0,
      halfWidth: 225,
      mass: 6 * 178,
      used: 6000,
    };
    const variants = flipVariants(many, true);

    const shapes = variants.map(variant =>
      variant.slots.map(slot => (slot.flipped ? 'T' : 'B')).join(''),
    );

    expect(variants).toHaveLength(4);
    expect(shapes).toEqual(['BBBBBB', 'TTTTTT', 'TBTBTB', 'BTBTBT']);
  });

  it('leaves everything but the flips alone', () => {
    const [pattern] = patterns([['LONG', 4]]);

    for (const variant of flipVariants(pattern!, true)) {
      expect(variant.slots.map(slot => slot.x)).toEqual(
        pattern!.slots.map(slot => slot.x),
      );
      expect(variant.slack).toBe(pattern!.slack);
      expect(variant.mass).toBe(pattern!.mass);
    }
  });
});

describe('patternDemand', () => {
  it('counts each type once per slot', () => {
    const mixed = patterns([
      ['LONG', 4],
      ['SHORT', 4],
    ]).find(pattern => shape(pattern) === 'LONG+SHORT');

    expect([...patternDemand(mixed!)]).toEqual([
      ['LONG', 1],
      ['SHORT', 1],
    ]);
  });
});
