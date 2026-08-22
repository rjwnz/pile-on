/**
 * Colour per pile type, stable across renders and across sessions.
 *
 * Derived from the type id rather than its position in the catalogue, so
 * adding a pile type does not recolour the whole drawing — a loader who has
 * learned "the blue ones are the SP168s" should stay right.
 *
 * Each entry pairs a light shaft with a darker plate of the same hue, so the
 * helices read as part of the same pile rather than as separate objects, and
 * the pile type is still distinguishable in greyscale on a printed plan.
 */
export interface PileColour {
  /** The shaft, in both the tier plans and the 3D view. */
  readonly shaft: string;
  /** The helix plates, darker so they read as part of the same pile. */
  readonly helix: string;
  /** Outline for the tier plans, which are drawn flat and need the edge. */
  readonly outline: string;
}

const PALETTE: readonly PileColour[] = [
  {shaft: '#bae6fd', helix: '#38bdf8', outline: '#075985'},
  {shaft: '#fde68a', helix: '#f59e0b', outline: '#92400e'},
  {shaft: '#bbf7d0', helix: '#34d399', outline: '#065f46'},
  {shaft: '#e9d5ff', helix: '#a78bfa', outline: '#5b21b6'},
  {shaft: '#fecaca', helix: '#f87171', outline: '#991b1b'},
  {shaft: '#cbd5e1', helix: '#64748b', outline: '#1e293b'},
];

/** Small stable string hash — FNV-1a, enough to spread ids over the palette. */
function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return Math.abs(result);
}

export function colourForPileType(pileTypeId: string): PileColour {
  return PALETTE[hash(pileTypeId) % PALETTE.length]!;
}
