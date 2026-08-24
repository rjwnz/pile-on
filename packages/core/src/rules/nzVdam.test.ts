import {describe, expect, it} from '@jest/globals';
import {NZ_VDAM_2016} from './nzVdam';

describe('ruleset', () => {
  it('is versioned so a quote can be re-explained after the rules change', () => {
    expect(NZ_VDAM_2016.version).toBe('nz-vdam-2016');
    expect(NZ_VDAM_2016.effectiveFrom).toBe('2017-02-01');
  });

  it('treats 2550 mm as the general-access width limit', () => {
    expect(NZ_VDAM_2016.maxWidth).toBe(2550);
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
