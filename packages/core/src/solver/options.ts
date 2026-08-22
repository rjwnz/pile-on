import {DEFAULT_LOADING_OPTIONS, type LoadingOptions} from '../domain/loading';

/**
 * What the packer is allowed to try.
 *
 * Split from `LoadingOptions` on purpose. Everything there decides whether a
 * plan is *legal*, and `validatePlan` reads it; everything here only shapes the
 * *search*, and turning any of it off can never make an illegal plan legal. A
 * `PackingOptions` is a `LoadingOptions`, so the packer and the validator are
 * still reading one set of numbers.
 */
export interface PackingOptions extends LoadingOptions {
  /**
   * May a pile be loaded tip-to-headboard?
   *
   * Flipping moves a pile's helices to `length − offsetFromButt`, which is a
   * second stagger lever on top of sliding the lane along the deck, and it
   * costs nothing in the yard. Whether it is acceptable is a question about how
   * this job gets unloaded, not about geometry, which is why it is an option.
   */
  readonly allowFlips: boolean;
  /**
   * How many part-built tiers the lane sweep carries forward.
   *
   * One is plain greedy. Widening it recovers the cases where the densest lane
   * to place *now* leaves an awkward strip that a slightly worse lane would
   * have left usable. Past about eight the returns stop and the clock does not.
   */
  readonly beamWidth: number;
  /**
   * Longest a lane may be spent enumerating end-to-end fill patterns.
   *
   * Distinct pile lengths multiply, and a catalogue with a dozen of them can
   * generate more patterns than are worth scoring. The cap is on how many are
   * kept, best first.
   */
  readonly maxLanePatterns: number;
}

export const DEFAULT_PACKING_OPTIONS: PackingOptions = Object.freeze({
  ...DEFAULT_LOADING_OPTIONS,
  allowFlips: true,
  beamWidth: 4,
  maxLanePatterns: 24,
});

/** The packer with one hand tied — used to measure what flipping is worth. */
export function withoutFlips(options: PackingOptions): PackingOptions {
  return {...options, allowFlips: false};
}
