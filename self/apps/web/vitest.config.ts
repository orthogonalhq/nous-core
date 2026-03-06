import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', '__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@nous/shared': path.resolve(__dirname, '../../shared/src/index.ts'),
      '@nous/autonomic-storage': path.resolve(
        __dirname,
        '../../autonomic/storage/src/index.ts',
      ),
      '@nous/autonomic-embeddings': path.resolve(
        __dirname,
        '../../autonomic/embeddings/src/index.ts',
      ),
      '@nous/memory-access': path.resolve(
        __dirname,
        '../../memory/access/src/index.ts',
      ),
      '@nous/memory-mwc': path.resolve(
        __dirname,
        '../../memory/mwc/src/index.ts',
      ),
      '@nous/memory-ltm': path.resolve(
        __dirname,
        '../../memory/ltm/src/index.ts',
      ),
      '@nous/subcortex-witnessd': path.resolve(
        __dirname,
        '../../subcortex/witnessd/src/index.ts',
      ),
    },
  },
});
