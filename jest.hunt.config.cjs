'use strict';

/*
 * The hunts, which the default test run deliberately leaves alone.
 *
 * A hunt is a randomised property search over the solver: fresh seed each
 * time, thousands of runs, minutes to finish. That is the right shape for
 * going looking for bugs and the wrong shape for a gate — `pnpm test` and CI
 * have to be quick and to give the same answer twice, and a hunt is neither.
 *
 * Kept out of the root config's `projects` list so nothing picks it up by
 * accident. Reached only through `pnpm hunt`.
 *
 * Compilation is borrowed from the core suite rather than restated, because
 * the hunts import the same sources and must be built the same way.
 */
const core = require('./packages/core/jest.config.cjs');

module.exports = {
  displayName: 'hunt',
  rootDir: __dirname,
  testEnvironment: 'node',
  transform: core.transform,
  testMatch: ['<rootDir>/packages/*/src/**/*.hunt.test.ts'],
};
