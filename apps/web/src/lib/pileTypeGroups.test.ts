import {describe, expect, it} from '@jest/globals';
import type {PileType} from '@pile-on/core';
import {groupPileTypes} from './pileTypeGroups';
import {pileTypeColor} from '../components/PileTypeBadge';

function pile(id: string, length: number, helix = false): PileType {
  return {
    id,
    name: id,
    length,
    shaftRadius: 84,
    mass: 100,
    helices: helix ? [{offsetFromButt: 400, radius: 225, length: 110}] : [],
  };
}

describe('groupPileTypes', () => {
  it('gathers a starter and its extensions under one code', () => {
    const groups = groupPileTypes([
      pile('SP1-ext-3000', 3000),
      pile('SP1-starter', 6000, true),
      pile('SP3-starter', 4500, true),
    ]);

    expect(groups.map(g => g.code)).toEqual(['SP1', 'SP3']);
    expect(groups[0]!.members.map(m => m.id)).toEqual([
      'SP1-starter',
      'SP1-ext-3000',
    ]);
  });

  it('leads with the starter, then extensions shortest first', () => {
    const groups = groupPileTypes([
      pile('SP1-ext-6000', 6000),
      pile('SP1-ext-3000', 3000),
      pile('SP1-starter', 6000, true),
    ]);

    expect(groups[0]!.members.map(m => m.id)).toEqual([
      'SP1-starter',
      'SP1-ext-3000',
      'SP1-ext-6000',
    ]);
  });

  it('keeps groups in the order their code first appears', () => {
    const groups = groupPileTypes([
      pile('SP3-starter', 4500, true),
      pile('SP1-starter', 6000, true),
    ]);

    expect(groups.map(g => g.code)).toEqual(['SP3', 'SP1']);
  });
});

describe('pileTypeColor', () => {
  it('is stable for a code, so a type wears one colour everywhere', () => {
    expect(pileTypeColor('SP1')).toBe(pileTypeColor('SP1'));
  });

  it('separates different codes onto different colours', () => {
    // Not guaranteed in general (a palette wraps), but these three must differ
    // for the grouping to read at a glance in the common small-fleet case.
    const colors = new Set(['SP1', 'SP3', 'SP7'].map(pileTypeColor));
    expect(colors.size).toBe(3);
  });
});
