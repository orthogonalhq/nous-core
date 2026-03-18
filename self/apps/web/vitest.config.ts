import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      '@nous/shared': path.resolve(__dirname, '../../shared/src/index.ts'),
      '@nous/ui/panels': path.resolve(__dirname, '../../ui/src/panels/index.ts'),
      '@nous/ui': path.resolve(__dirname, '../../ui/src/index.ts'),
      '@nous/subcortex-apps': path.resolve(
        __dirname,
        '../../subcortex/apps/src/index.ts',
      ),
      '@nous/autonomic-runtime': path.resolve(
        __dirname,
        '../../autonomic/runtime/src/index.ts',
      ),
      '@nous/cortex-core': path.resolve(__dirname, '../../cortex/core/src/index.ts'),
      '@nous/subcortex-projects': path.resolve(
        __dirname,
        '../../subcortex/projects/src/index.ts',
      ),
      '@nous/subcortex-workflows': path.resolve(
        __dirname,
        '../../subcortex/workflows/src/index.ts',
      ),
      '@nous/subcortex-registry': path.resolve(
        __dirname,
        '../../subcortex/registry/src/index.ts',
      ),
      '@nous/subcortex-nudges': path.resolve(
        __dirname,
        '../../subcortex/nudges/src/index.ts',
      ),
      '@nous/subcortex-scheduler': path.resolve(
        __dirname,
        '../../subcortex/scheduler/src/index.ts',
      ),
      '@nous/subcortex-escalation': path.resolve(
        __dirname,
        '../../subcortex/escalation/src/index.ts',
      ),
      '@nous/subcortex-communication-gateway': path.resolve(
        __dirname,
        '../../subcortex/communication-gateway/src/index.ts',
      ),
      '@nous/subcortex-endpoint-trust': path.resolve(
        __dirname,
        '../../subcortex/endpoint-trust/src/index.ts',
      ),
      '@nous/subcortex-voice-control': path.resolve(
        __dirname,
        '../../subcortex/voice-control/src/index.ts',
      ),
      '@nous/subcortex-public-mcp': path.resolve(
        __dirname,
        '../../subcortex/public-mcp/src/index.ts',
      ),
    },
  },
  test: {
    environment: 'node',
  },
});
