import {DEFAULT_LOADING_OPTIONS, type LoadingOptions} from '../domain/loading';

/**
 * What the packer is allowed to try. Split from `LoadingOptions` on purpose:
 * everything there decides whether a plan is *legal*; everything here only
 * shapes the *search*, and can never make an illegal plan legal.
 */
export interface PackingOptions extends LoadingOptions {
  /** May a pile be loaded tip-to-headboard? The one stagger lever inside a
   * banded pack — flipped piles put their plates at the other end, and the
   * pack closes from plate pitch to shaft pitch. Whether it is acceptable is
   * an unloading question. */
  readonly allowFlips: boolean;
}

export const DEFAULT_PACKING_OPTIONS: PackingOptions = Object.freeze({
  ...DEFAULT_LOADING_OPTIONS,
  allowFlips: true,
});

/** The packer with one hand tied — used to measure what flipping is worth. */
export function withoutFlips(options: PackingOptions): PackingOptions {
  return {...options, allowFlips: false};
}
