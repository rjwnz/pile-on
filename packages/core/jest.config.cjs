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
