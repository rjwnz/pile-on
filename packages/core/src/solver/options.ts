import {DEFAULT_LOADING_OPTIONS, type LoadingOptions} from '../domain/loading';

/**
 * What the packer is allowed to try. Split from `LoadingOptions` on purpose:
 * everything there decides whether a plan is *legal*; everything here only
 * shapes the *search*, and can never make an illegal plan legal.
 */
export interface PackingOptions extends LoadingOptions {
  /** May a pile be loaded tip-to-headboard? A second stagger lever, free in
   * the yard; whether it is acceptable is an unloading question. */
  readonly allowFlips: boolean;
  /** Part-built tiers the lane sweep carries. One is plain greedy; past about
   * eight the returns stop and the clock does not. */
  readonly beamWidth: number;
  /** Cap on end-to-end fill patterns kept per lane, best first. */
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
