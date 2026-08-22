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
  /** Lit face — the shaft in plan, the top of the box in the 3D view. */
  readonly shaft: string;
  /** Mid tone — the helix plate in plan, the long side of the box in 3D. */
  readonly helix: string;
  /**
   * Shaded face for the cut end of a pile in the 3D view.
   *
   * Deliberately not the outline colour: piles sit nearly end to end, so a row
   * of end caps forms a continuous band across the load, and at outline
   * darkness that band reads as damage rather than as pile ends.
   */
  readonly end: string;
  readonly outline: string;
}

const PALETTE: readonly PileColour[] = [
  {shaft: '#bae6fd', helix: '#38bdf8', end: '#0ea5e9', outline: '#075985'},
  {shaft: '#fde68a', helix: '#f59e0b', end: '#d97706', outline: '#92400e'},
  {shaft: '#bbf7d0', helix: '#34d399', end: '#10b981', outline: '#065f46'},
  {shaft: '#e9d5ff', helix: '#a78bfa', end: '#8b5cf6', outline: '#5b21b6'},
  {shaft: '#fecaca', helix: '#f87171', end: '#ef4444', outline: '#991b1b'},
  {shaft: '#cbd5e1', helix: '#64748b', end: '#475569', outline: '#1e293b'},
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

export const PALETTE_SIZE = PALETTE.length;
