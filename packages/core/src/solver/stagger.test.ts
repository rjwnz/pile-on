import {describe, expect, it} from '@jest/globals';
import {helixIntervals, staggerOffsets} from './stagger';
import {DOUBLE, PLAIN, SINGLE, place} from '../geometry/testFixtures';

describe('helixIntervals', () => {
  it('reports where each plate sits on the deck, not on the pile', () => {
    // SINGLE has one plate 500 mm from the butt, 100 mm long, so a pile whose
    // nose is at 2000 presents steel from 2450 to 2550.
    expect(helixIntervals([place(SINGLE, {x: 2000})])).toEqual([
      {start: 2450, end: 2550},
    ]);
  });

  it('follows the plates when a pile is flipped', () => {
    // 6000 − 500 = 5500 from the nose once the pile is turned round.
    expect(helixIntervals([place(SINGLE, {x: 0, flipped: true})])).toEqual([
      {start: 5450, end: 5550},
    ]);
  });

  it('has nothing to say about a plain shaft', () => {
    expect(helixIntervals([place(PLAIN)])).toEqual([]);
  });

  it('collects every plate of every pile given to it', () => {
    expect(
      helixIntervals([place(DOUBLE, {x: 0}), place(DOUBLE, {x: 6000})]),
    ).toHaveLength(4);
  });
});

describe('staggerOffsets', () => {
  const own = [{start: 450, end: 550}];

  it('always offers standing still and running to the end of the slack', () => {
    expect(staggerOffsets(own, [], 300)).toEqual([0, 300]);
  });

  it('offers only standing still when there is no slack to spend', () => {
    expect(staggerOffsets(own, [{start: 450, end: 550}], 0)).toEqual([0]);
  });

  it('offers the offset that butts this plate up behind a neighbour', () => {
    // Neighbour occupies 500–600, so sliding 150 puts this plate's leading edge
    // exactly where theirs stops. Segments are half-open, so that is clear.
    expect(staggerOffsets(own, [{start: 500, end: 600}], 300)).toContain(150);
  });

  it('offers the offset that stops this plate short of a neighbour', () => {
    // Own plate ends at 550; a neighbour starting at 700 is reached at 150.
    expect(staggerOffsets(own, [{start: 700, end: 800}], 300)).toContain(150);
  });

  it('leaves out offsets that would need more slack than there is', () => {
    expect(staggerOffsets(own, [{start: 2000, end: 2100}], 300)).toEqual([
      0, 300,
    ]);
  });

  it('never offers a backwards offset — the lane starts as far forward as it goes', () => {
    const offsets = staggerOffsets(own, [{start: 100, end: 200}], 300);

    expect(offsets.every(offset => offset >= 0)).toBe(true);
  });

  it('is sorted and free of duplicates', () => {
    const offsets = staggerOffsets(
      [
        {start: 450, end: 550},
        {start: 1150, end: 1250},
      ],
      [
        {start: 500, end: 600},
        {start: 1200, end: 1300},
      ],
      600,
    );

    expect(offsets).toEqual([...new Set(offsets)].sort((a, b) => a - b));
  });

  it('stays a handful of offsets even for a busy neighbour', () => {
    /*
     * Two plates against four is at most two boundaries per pair plus the two
     * ends — eighteen, and thirteen after duplicates go. That it stays a number
     * you could score by hand is the whole point: the requirement only changes
     * at a boundary, so this small list contains every distinct answer and the
     * search never has to sample.
     */
    const offsets = staggerOffsets(
      [
        {start: 450, end: 550},
        {start: 1150, end: 1250},
      ],
      [
        {start: 500, end: 600},
        {start: 900, end: 1000},
        {start: 1300, end: 1400},
        {start: 1700, end: 1800},
      ],
      2000,
    );

    expect(offsets.length).toBeLessThanOrEqual(2 * 2 * 4 + 2);
    expect(offsets).toHaveLength(13);
  });
});
