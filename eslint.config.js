'use strict';

/*
 * Flat config. gts 7 exports a ready-made flat config array (ESLint 9 +
 * typescript-eslint 8 + prettier). We spread it and add monorepo-specific bits.
 *
 * Note: gts points type-aware rules at `./tsconfig.json` relative to the ESLint
 * working directory, so lint must be run from the repo root. The root tsconfig
 * deliberately includes every file we lint.
 */
const gts = require('gts');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/coverage/',
      '**/build/',
      '**/*.d.ts',
    ],
  },

  ...gts,

  // CommonJS tooling files (jest configs, this file) — not TypeScript, not ESM.
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },

  // Test files: `describe.only` / `it.only` are banned by gts, which is right for
  // committed code. Everything else stays as strict as production source.
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];
