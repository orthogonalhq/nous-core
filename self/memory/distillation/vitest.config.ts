import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(__dirname),
  resolve: {
    alias: {
      '@nous/shared': path.resolve(__dirname, '../../shared/src/index.ts'),
      '@nous/autonomic-storage': path.resolve(__dirname, '../../autonomic/storage/src/index.ts'),
      '@nous/memory-ltm': path.resolve(__dirname, '../ltm/src/index.ts'),
      '@nous/memory-stubs': path.resolve(__dirname, '../stubs/src/index.ts'),
    },
  },
  test: {
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: ['**/dist/**', '**/node_modules/**'],
  },
});
