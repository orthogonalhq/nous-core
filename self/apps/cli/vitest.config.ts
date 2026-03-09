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
      '@nous/shared': resolve(__dirname, '../../shared/src/index.ts'),
      '@nous/autonomic-storage': resolve(
        __dirname,
        '../../autonomic/storage/src/index.ts',
      ),
      '@nous/autonomic-embeddings': resolve(
        __dirname,
        '../../autonomic/embeddings/src/index.ts',
      ),
      '@nous/memory-access': resolve(__dirname, '../../memory/access/src/index.ts'),
      '@nous/memory-mwc': resolve(__dirname, '../../memory/mwc/src/index.ts'),
      '@nous/memory-ltm': resolve(__dirname, '../../memory/ltm/src/index.ts'),
      '@nous/memory-stm': resolve(__dirname, '../../memory/stm/src/index.ts'),
      '@nous/memory-knowledge-index': resolve(
        __dirname,
        '../../memory/knowledge-index/src/index.ts',
      ),
      '@nous/subcortex-tools': resolve(
        __dirname,
        '../../subcortex/tools/src/index.ts',
      ),
      '@nous/subcortex-witnessd': resolve(
        __dirname,
        '../../subcortex/witnessd/src/index.ts',
      ),
      '@nous/subcortex-opctl': resolve(
        __dirname,
        '../../subcortex/opctl/src/index.ts',
      ),
      '@nous/subcortex-projects': resolve(
        __dirname,
        '../../subcortex/projects/src/index.ts',
      ),
      '@nous/subcortex-router': resolve(
        __dirname,
        '../../subcortex/router/src/index.ts',
      ),
      '@nous/subcortex-providers': resolve(
        __dirname,
        '../../subcortex/providers/src/index.ts',
      ),
      '@nous/subcortex-mao': resolve(__dirname, '../../subcortex/mao/src/index.ts'),
      '@nous/subcortex-gtm': resolve(__dirname, '../../subcortex/gtm/src/index.ts'),
      '@nous/cortex-pfc': resolve(__dirname, '../../cortex/pfc/src/index.ts'),
      '@nous/cortex-core': resolve(__dirname, '../../cortex/core/src/index.ts'),
    },
  },
});
