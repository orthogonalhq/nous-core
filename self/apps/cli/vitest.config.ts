import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@nous/web/server/bootstrap': resolve(__dirname, '../web/server/bootstrap.ts'),
      '@nous/web/server/trpc/root': resolve(__dirname, '../web/server/trpc/root.ts'),
    },
  },
});
