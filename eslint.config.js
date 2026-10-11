import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'assets-src/**',
      'assets-work/**',
      'reference/**',
      'public/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      // Gameplay randomness must come from seeded streams (core/rng); see docs/PLAN.md section 2.4.
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use a seeded Rng stream (src/core/rng.ts).',
        },
      ],
    },
  },
  {
    files: ['src/core/rng.ts', 'src/entities/fx.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
);
