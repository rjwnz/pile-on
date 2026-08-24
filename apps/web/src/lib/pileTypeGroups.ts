import {groupBy, pilePartOf, pileTypeCode, type PileType} from '@pile-on/core';

/** A pile-type code and every shippable piece that belongs to it. */
export interface PileTypeGroup {
  readonly code: string;
  readonly members: readonly PileType[];
}

/**
 * Gather pile types under their shared code, so a starter and its extensions
 * sit together in a table. Groups keep the order their code first appears;
 * within a group the starter leads, then extensions shortest first.
 */
export function groupPileTypes(
  types: readonly PileType[],
): readonly PileTypeGroup[] {
  const groups = groupBy(types, pileTypeCode);
  return [...groups].map(([code, members]) => ({
    code,
    members: [...members].sort(byPart),
  }));
}

function byPart(a: PileType, b: PileType): number {
  const rank = (type: PileType) => (pilePartOf(type) === 'starter' ? 0 : 1);
  return rank(a) - rank(b) || a.length - b.length;
}
