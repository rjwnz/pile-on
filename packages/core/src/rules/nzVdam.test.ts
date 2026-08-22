import {describe, expect, it} from '@jest/globals';
import {
  NZ_VDAM_2016,
  isDivisibleLoad,
  isOverGrossMass,
  isOverHeight,
  isOverWidth,
} from './nzVdam';

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

describe('isOverGrossMass', () => {
  it('treats 44 t as the last general-access gross mass', () => {
    expect(isOverGrossMass(44000)).toBe(false);
    expect(isOverGrossMass(44001)).toBe(true);
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

  it('carries no axle limits — payload capacity is the mass constraint', () => {
    expect(Object.keys(NZ_VDAM_2016)).toEqual([
      'version',
      'effectiveFrom',
      'maxWidth',
      'maxHeight',
      'maxGrossMass',
      'maxTrailerToTruckMassRatio',
      'minStaticRollThreshold',
      'trailerSrtCertificationHeight',
    ]);
  });
});
