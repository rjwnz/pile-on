import {describe, expect, it} from '@jest/globals';
import {
  EMPTY_JOB,
  jobQuantity,
  setJobQuantity,
  totalPileCount,
  totalPileMass,
  type Job,
} from './job';
import type {Catalogue} from './catalogue';
import type {PileType} from './pile';

function type(id: string, mass: number): PileType {
  return {id, name: id, length: 6000, shaftRadius: 84, mass, helices: []};
}

const CATALOGUE: Catalogue = {
  pileTypes: [type('A', 100), type('B', 250)],
  vehicles: [],
};

const JOB: Job = {
  name: 'Te Rapa',
  lines: [
    {pileTypeId: 'A', quantity: 10},
    {pileTypeId: 'B', quantity: 4},
  ],
};

describe('jobQuantity', () => {
  it('reads a line', () => {
    expect(jobQuantity(JOB, 'A')).toBe(10);
  });

  it('is zero for a type the job does not use', () => {
    expect(jobQuantity(JOB, 'C')).toBe(0);
  });
});

describe('setJobQuantity', () => {
  it('adds a line for a type not yet in the job', () => {
    const next = setJobQuantity(JOB, 'C', 7);

    expect(next.lines).toHaveLength(3);
    expect(jobQuantity(next, 'C')).toBe(7);
  });

  it('updates an existing line in place, keeping order', () => {
    const next = setJobQuantity(JOB, 'A', 99);

    expect(next.lines.map(l => l.pileTypeId)).toEqual(['A', 'B']);
    expect(jobQuantity(next, 'A')).toBe(99);
  });

  it('drops the line at zero rather than storing a zero', () => {
    const next = setJobQuantity(JOB, 'A', 0);

    expect(next.lines.map(l => l.pileTypeId)).toEqual(['B']);
  });

  it('drops the line for a negative quantity too', () => {
    expect(setJobQuantity(JOB, 'A', -5).lines).toHaveLength(1);
  });

  it('is a no-op when zeroing a type that was never there', () => {
    expect(setJobQuantity(JOB, 'C', 0)).toEqual(JOB);
  });

  it('keeps the job name', () => {
    expect(setJobQuantity(JOB, 'A', 3).name).toBe('Te Rapa');
  });

  it('does not mutate the job it was given', () => {
    const before = JSON.stringify(JOB);
    setJobQuantity(JOB, 'A', 0);

    expect(JSON.stringify(JOB)).toBe(before);
  });
});

describe('totalPileCount', () => {
  it('sums the quantities', () => {
    expect(totalPileCount(JOB)).toBe(14);
  });

  it('is zero for an empty job', () => {
    expect(totalPileCount(EMPTY_JOB)).toBe(0);
  });
});

describe('totalPileMass', () => {
  it('weights each line by its pile type mass', () => {
    expect(totalPileMass(JOB, CATALOGUE)).toBe(10 * 100 + 4 * 250);
  });

  it('skips a line whose pile type is missing, rather than blanking the total', () => {
    const withGhost: Job = {
      ...JOB,
      lines: [...JOB.lines, {pileTypeId: 'GHOST', quantity: 1000}],
    };

    // findDanglingReferences is what reports the broken line; the total should
    // still be useful in the meantime.
    expect(totalPileMass(withGhost, CATALOGUE)).toBe(2000);
  });

  it('is zero for an empty job', () => {
    expect(totalPileMass(EMPTY_JOB, CATALOGUE)).toBe(0);
  });
});
