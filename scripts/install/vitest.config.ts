import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
