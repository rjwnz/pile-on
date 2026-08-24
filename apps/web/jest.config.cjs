'use strict';

module.exports = {
  displayName: 'web',
  rootDir: __dirname,
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/src/testing/setup.ts'],
  moduleNameMapper: {
    // Mirror the Vite alias so tests import the same source the app bundles.
    '^@pile-on/core$': '<rootDir>/../../packages/core/src/index.ts',
    // Subpath imports, which in practice means the shared test fixtures: the
    // web suite loads the same steel and the same deck as core's.
    '^@pile-on/core/(.*)$': '<rootDir>/../../packages/core/src/$1.ts',
    '\\.css$': '<rootDir>/src/testing/styleMock.cjs',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          verbatimModuleSyntax: false,
          jsx: 'react-jsx',
        },
      },
    ],
  },
  collectCoverageFrom: [
    '<rootDir>/src/**/*.{ts,tsx}',
    '!<rootDir>/src/**/*.test.{ts,tsx}',
    '!<rootDir>/src/main.tsx',
    '!<rootDir>/src/testing/**',
  ],
};
