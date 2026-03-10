import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      '@nous/shared': path.resolve(__dirname, '../../shared/src/index.ts'),
      '@nous/subcortex-scheduler': path.resolve(
        __dirname,
        '../../subcortex/scheduler/src/index.ts',
      ),
      '@nous/subcortex-escalation': path.resolve(
        __dirname,
        '../../subcortex/escalation/src/index.ts',
      ),
    },
  },
  test: {
    environment: 'node',
  },
});
