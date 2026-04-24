import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      '__tests__/**/*.test.ts',
      '__tests__/**/*.test.tsx',
      'src/main/__tests__/**/*.test.ts',
    ],
  },
});
