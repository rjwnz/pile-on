import {describe, expect, it} from '@jest/globals';
import {
  NZ_VDAM_2016,
  bridgeFormulaLimit,
  isDivisibleLoad,
  isOverHeight,
  isOverWidth,
} from './nzVdam';

describe('bridgeFormulaLimit', () => {
  it('does not apply below the 1.8 m minimum span', () => {
    expect(bridgeFormulaLimit(1799, 2)).toBeNull();
  });

  it('applies from exactly 1.8 m', () => {
    expect(bridgeFormulaLimit(1800, 2)).toBe(15500);
  });

  it('holds a band up to but not including its upper bound', () => {
    expect(bridgeFormulaLimit(2499, 2)).toBe(15500);
    expect(bridgeFormulaLimit(2500, 2)).toBe(17500);
  });

  it.each([
    [3000, 19000],
    [5100, 25000],
    [8200, 31000],
    [12000, 37000],
    [15600, 43000],
  ])('gives %i mm span a limit of %i kg', (span, expected) => {
    expect(bridgeFormulaLimit(span, 6)).toBe(expected);
  });

  it('caps at 44 t from 16 m for an ordinary combination', () => {
    expect(bridgeFormulaLimit(16000, 6)).toBe(44000);
    expect(bridgeFormulaLimit(25000, 6)).toBe(44000);
  });

  it('allows 45 t from 16.8 m only with at least seven axles', () => {
    expect(bridgeFormulaLimit(16800, 6)).toBe(44000);
    expect(bridgeFormulaLimit(16800, 7)).toBe(45000);
  });

  it('allows 46 t from 17.4 m only with at least eight axles', () => {
    expect(bridgeFormulaLimit(17400, 7)).toBe(45000);
    expect(bridgeFormulaLimit(17400, 8)).toBe(46000);
  });

  it('is monotonic in span', () => {
    let previous = 0;
    for (let span = 1800; span <= 20000; span += 100) {
      const limit = bridgeFormulaLimit(span, 8);
      expect(limit).not.toBeNull();
      expect(limit!).toBeGreaterThanOrEqual(previous);
      previous = limit!;
    }
  });
});

describe('dimension checks', () => {
  it('treats 2550 mm as the last legal width', () => {
    expect(isOverWidth(2550)).toBe(false);
    expect(isOverWidth(2551)).toBe(true);
  });

  it('treats 4300 mm as the last legal height', () => {
    expect(isOverHeight(4300)).toBe(false);
    expect(isOverHeight(4301)).toBe(true);
  });
});

describe('isDivisibleLoad', () => {
  it('treats a single pile as indivisible, so overdimension permits are open', () => {
    expect(isDivisibleLoad(1)).toBe(false);
  });

  it('treats any multi-pile load as divisible', () => {
    expect(isDivisibleLoad(2)).toBe(true);
  });
});

describe('ruleset', () => {
  it('is versioned so a quote can be re-explained after the rules change', () => {
    expect(NZ_VDAM_2016.version).toBe('nz-vdam-2016');
    expect(NZ_VDAM_2016.effectiveFrom).toBe('2017-02-01');
  });

  it('lists bridge formula bands in ascending span order', () => {
    const spans = NZ_VDAM_2016.bridgeFormula.map(band => band.fromSpan);

    expect(spans).toEqual([...spans].sort((a, b) => a - b));
  });
});
