import {describe, expect, it} from '@jest/globals';
import {
  VEHICLE_KINDS,
  deckArea,
  payloadCapacity,
  type Vehicle,
} from './vehicle';

const SEMI: Vehicle = {
  id: 'V',
  name: 'V',
  kind: 'semi_trailer',
  deckLength: 12500,
  deckWidth: 2450,
  deckHeight: 1350,
  tare: 15800,
  maxGross: 44000,
};

describe('payloadCapacity', () => {
  it('is gross less tare', () => {
    expect(payloadCapacity(SEMI)).toBe(28200);
  });

  it('goes negative on a nonsense catalogue entry rather than clamping', () => {
    // Surfacing the bad data beats hiding it behind a floor of zero.
    expect(payloadCapacity({...SEMI, maxGross: 10000})).toBe(-5800);
  });
});

describe('deckArea', () => {
  it('multiplies deck length by width', () => {
    expect(deckArea(SEMI)).toBe(12500 * 2450);
  });
});

describe('VEHICLE_KINDS', () => {
  it('covers the combinations that carry piles', () => {
    expect(VEHICLE_KINDS).toEqual([
      'rigid',
      'semi_trailer',
      'full_trailer',
      'simple_trailer',
      'b_train',
    ]);
  });
});
