import {describe, expect, it} from '@jest/globals';
import {helicesMayInterleave, isSingleHelix, maxRadius} from './pile';
import {
  DOUBLE,
  HELIX_RADIUS,
  PLAIN,
  SHAFT_RADIUS,
  SINGLE,
} from '../geometry/testFixtures';

describe('isSingleHelix', () => {
  it('is true for exactly one plate', () => {
    expect(isSingleHelix(SINGLE)).toBe(true);
  });

  it('is false for two plates', () => {
    expect(isSingleHelix(DOUBLE)).toBe(false);
  });

  it('is false for a plain shaft — there is nothing to interleave', () => {
    expect(isSingleHelix(PLAIN)).toBe(false);
  });
});

describe('helicesMayInterleave', () => {
  it('allows two single-helix piles to nest', () => {
    expect(helicesMayInterleave(SINGLE, SINGLE)).toBe(true);
  });

  it('refuses when either neighbour is double-helix', () => {
    expect(helicesMayInterleave(SINGLE, DOUBLE)).toBe(false);
    expect(helicesMayInterleave(DOUBLE, SINGLE)).toBe(false);
    expect(helicesMayInterleave(DOUBLE, DOUBLE)).toBe(false);
  });
});

describe('maxRadius', () => {
  it('is the shaft radius for a plain pile', () => {
    expect(maxRadius(PLAIN)).toBe(SHAFT_RADIUS);
  });

  it('is the widest plate when helices are present', () => {
    expect(maxRadius(DOUBLE)).toBe(HELIX_RADIUS);
  });
});
