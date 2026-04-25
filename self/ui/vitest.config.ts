import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(__dirname),
  resolve: {
    alias: {
      '@nous/shared': path.resolve(__dirname, '../shared/src/index.ts'),
      '@nous/subcortex-opctl': path.resolve(__dirname, '../subcortex/opctl/src/index.ts'),
      '@nous/transport': path.resolve(__dirname, '../transport/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['**/dist/**', '**/node_modules/**'],
  },
});
