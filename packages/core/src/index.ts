/**
 * @pile-on/core — the engine. No DOM, no React, no I/O.
 *
 * Everything the app does to a load plan goes through here, so that the
 * optimiser and the manual editor can never disagree about what is legal.
 */

export * from './units';

export * from './domain/pile';
export * from './domain/placement';
export * from './domain/vehicle';
export * from './domain/catalogue';

export * from './geometry/profile';
export * from './geometry/separation';

export * from './rules/nzVdam';

export * from './validation/result';

export * from './io/fields';
export * from './io/pileTypeCsv';
export * from './io/vehicleCsv';
export * from './io/appState';
