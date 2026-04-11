import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts', 'src/main/__tests__/**/*.test.ts'],
  },
});
