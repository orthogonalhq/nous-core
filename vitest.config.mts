import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config defining workspace projects.
 * Each package's vitest.config.ts provides resolve aliases and test config.
 * Ensures sandbox/stubs and other packages use their own configs when tests
 * run from workspace root (fixes "Cannot find package '@nous/shared'" etc).
 */
export default defineConfig({
  test: {
    projects: [
      'self/**/vitest.config.ts',
      'self/**/vitest.config.mts',
      'scripts/**/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: [
        '**/node_modules/**',
        '**/*.d.ts',
        '**/__tests__/**',
        '**/stubs/**',
        '**/scripts/**',
      ],
    },
  },
});
