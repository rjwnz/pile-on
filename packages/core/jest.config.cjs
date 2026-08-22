'use strict';

/*
 * ts-jest compiles to CommonJS for the test runtime. Two options from
 * tsconfig.base.json have to be relaxed to make that legal:
 *   - verbatimModuleSyntax: forbids ESM syntax in a CJS-emitting compilation
 *   - moduleResolution "bundler": only valid alongside ESM module output
 * Neither affects the shipped build, which still goes through Vite as ESM.
 */
module.exports = {
  displayName: 'core',
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  /*
   * `*.hunt.test.ts` is held back from the default run.
   *
   * A hunt is a randomised property search: it draws a fresh seed every time
   * and spends thousands of them, because covering ground it was not told
   * about is the entire point. That makes it the opposite of what `pnpm test`
   * and CI need — a green hunt is evidence rather than proof, a red one may
   * not reproduce, and either takes minutes. Run them deliberately, with
   * `pnpm hunt`.
   */
  testPathIgnorePatterns: ['/node_modules/', '\\.hunt\\.test\\.ts$'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          verbatimModuleSyntax: false,
        },
      },
    ],
  },
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/**/*.test.ts',
    '!<rootDir>/src/index.ts',
    '!<rootDir>/src/**/testFixtures.ts',
  ],
};
