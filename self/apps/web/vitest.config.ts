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
      '@nous/subcortex-witnessd': path.resolve(
        __dirname,
        '../../subcortex/witnessd/src/index.ts',
      ),
    },
  },
});
