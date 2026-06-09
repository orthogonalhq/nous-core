import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@nous/shared': path.resolve(__dirname, '../../shared/src/index.ts'),
      '@nous/subcortex-inference-runtime': path.resolve(
        __dirname,
        '../../subcortex/inference-runtime/src/index.ts',
      ),
    },
  },
  test: {
    include: ['__tests__/**/*.test.ts'],
    // Tests use dynamic await import() inside test bodies which can be slow
    // under thread pool concurrency during the monorepo-level run.
    testTimeout: 30000,
  },
});
