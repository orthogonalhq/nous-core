import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(__dirname),
  resolve: {
    alias: {
      '@nous/shared': path.resolve(__dirname, '../../shared/src/index.ts'),
      '@nous/autonomic-storage': path.resolve(
        __dirname,
        '../../autonomic/storage/src/index.ts',
      ),
      '@nous/autonomic-embeddings': path.resolve(
        __dirname,
        '../../autonomic/embeddings/src/index.ts',
      ),
      '@nous/cortex-pfc': path.resolve(__dirname, '../pfc/src/index.ts'),
      '@nous/memory-access': path.resolve(__dirname, '../../memory/access/src/index.ts'),
      '@nous/memory-ltm': path.resolve(__dirname, '../../memory/ltm/src/index.ts'),
      '@nous/memory-stm': path.resolve(__dirname, '../../memory/stm/src/index.ts'),
      '@nous/memory-mwc': path.resolve(__dirname, '../../memory/mwc/src/index.ts'),
      '@nous/subcortex-providers': path.resolve(
        __dirname,
        '../../subcortex/providers/src/index.ts',
      ),
      '@nous/subcortex-router': path.resolve(
        __dirname,
        '../../subcortex/router/src/index.ts',
      ),
      '@nous/subcortex-tools': path.resolve(
        __dirname,
        '../../subcortex/tools/src/index.ts',
      ),
      '@nous/subcortex-projects': path.resolve(
        __dirname,
        '../../subcortex/projects/src/index.ts',
      ),
      '@nous/subcortex-witnessd': path.resolve(
        __dirname,
        '../../subcortex/witnessd/src/index.ts',
      ),
    },
  },
  test: {
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
    // The barrel-identity test uses dynamic await import() which can be slow
    // under thread pool concurrency during the monorepo-level run.
    testTimeout: 30000,
  },
});
