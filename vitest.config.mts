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
      'scripts/**/vitest.config.ts',
    ],
  },
});
