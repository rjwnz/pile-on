import {describe, expect, it} from '@jest/globals';
import {
  TYRE_CLASSES,
  VEHICLE_KINDS,
  axleSetIds,
  axleSpan,
  payloadCapacity,
  type Axle,
  type Vehicle,
} from './vehicle';

function axle(xFromFront: number, setId: string, steering = false): Axle {
  return {xFromFront, tyreClass: 'T', setId, steering};
}

function vehicle(axles: Axle[]): Vehicle {
  return {
    id: 'V',
    name: 'V',
    kind: 'semi_trailer',
    deckLength: 12500,
    deckWidth: 2450,
    deckHeight: 1350,
    tare: 15800,
    maxGross: 44000,
    axles,
  };
}

describe('payloadCapacity', () => {
  it('is gross less tare', () => {
    expect(payloadCapacity(vehicle([]))).toBe(28200);
  });

  it('can be negative if the catalogue entry is nonsense, rather than clamping', () => {
    expect(payloadCapacity({...vehicle([]), maxGross: 10000})).toBe(-5800);
  });
});

describe('axleSetIds', () => {
  it('lists each set once, in the order the axles appear', () => {
    const v = vehicle([
      axle(0, 'steer', true),
      axle(3550, 'drive'),
      axle(4870, 'drive'),
      axle(10100, 'tri'),
      axle(11400, 'tri'),
    ]);

    expect(axleSetIds(v)).toEqual(['steer', 'drive', 'tri']);
  });

  it('is empty for a vehicle with no axles recorded', () => {
    expect(axleSetIds(vehicle([]))).toEqual([]);
  });
});

describe('axleSpan', () => {
  it('measures foremost to rearmost', () => {
    expect(axleSpan(vehicle([axle(0, 'a'), axle(10100, 'b')]))).toBe(10100);
  });

  it('does not care what order the axles are stored in', () => {
    expect(axleSpan(vehicle([axle(10100, 'b'), axle(0, 'a')]))).toBe(10100);
  });

  it('is zero when there are fewer than two axles', () => {
    expect(axleSpan(vehicle([]))).toBe(0);
    expect(axleSpan(vehicle([axle(3550, 'drive')]))).toBe(0);
  });
});

describe('enumerations', () => {
  it('lists the VDAM tyre classes', () => {
    expect(TYRE_CLASSES).toEqual(['S', 'SL', 'SM', 'T']);
  });

  it('lists the vehicle kinds the packer understands', () => {
    expect(VEHICLE_KINDS).toContain('semi_trailer');
    expect(VEHICLE_KINDS).toContain('b_train');
  });
});
