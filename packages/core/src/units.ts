/**
 * Unit conventions for the whole codebase.
 *
 * Every length is **millimetres** and every mass is **kilograms**. There are no
 * metres, no tonnes and no inches anywhere below the presentation layer. Pile
 * and deck dimensions are naturally whole millimetres, so this keeps the
 * geometry in exactly-representable integers and avoids the float drift you get
 * from carrying metres around a packing loop.
 *
 * Formatting to m / t is a rendering concern — see the `format` helpers.
 */

/** A length in millimetres. */
export type Millimetres = number;

/** A mass in kilograms. */
export type Kilograms = number;

/** Tolerance for geometric comparisons, in millimetres. */
export const GEOMETRIC_EPSILON: Millimetres = 1e-6;

/** Render a millimetre length as metres, for display only. */
export function toMetres(mm: Millimetres): number {
  return mm / 1000;
}

/** Render a kilogram mass as tonnes, for display only. */
export function toTonnes(kg: Kilograms): number {
  return kg / 1000;
}
