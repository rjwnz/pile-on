'use strict';

/*
 * Root Jest config. Each workspace package owns a `jest.config.cjs` so it can be
 * run standalone (`pnpm --filter @pile-on/core test`); this aggregates them so
 * `pnpm test:coverage` produces one combined report across the monorepo.
 */
module.exports = {
  projects: [
    '<rootDir>/packages/*/jest.config.cjs',
    '<rootDir>/apps/*/jest.config.cjs',
  ],

  collectCoverageFrom: [
    'packages/*/src/**/*.{ts,tsx}',
    'apps/*/src/**/*.{ts,tsx}',
    '!**/*.test.{ts,tsx}',
    '!**/*.d.ts',
    '!**/index.ts',
    '!**/main.tsx',
    '!**/testFixtures.ts',
    '!**/testing/**',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html', 'json-summary'],

  /*
   * `core` is pure logic with no excuse for untested branches — a packing bug
   * that reaches a quote is expensive. The UI layer is held to a lower bar on
   * purpose; push it up as the app stops being a skeleton.
   */
  coverageThreshold: {
    './packages/core/src/': {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95,
    },
    './apps/web/src/': {
      statements: 50,
      branches: 50,
      functions: 50,
      lines: 50,
    },
  },
};
