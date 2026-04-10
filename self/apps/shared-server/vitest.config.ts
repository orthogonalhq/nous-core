import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    // Tests use dynamic await import() inside test bodies which can be slow
    // under thread pool concurrency during the monorepo-level run.
    testTimeout: 30000,
  },
});
