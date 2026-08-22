import {describe, expect, it} from '@jest/globals';
import {extentOf} from './placement';
import {PILE_LENGTH, PLAIN, place} from '../geometry/testFixtures';

describe('extentOf', () => {
  it('runs from the leading end to the leading end plus the length', () => {
    expect(extentOf(place(PLAIN, {x: 1500}))).toEqual([
      1500,
      1500 + PILE_LENGTH,
    ]);
  });

  it('is unchanged by flipping — a flip does not move the pile', () => {
    expect(extentOf(place(PLAIN, {x: 1500, flipped: true}))).toEqual(
      extentOf(place(PLAIN, {x: 1500})),
    );
  });
});
