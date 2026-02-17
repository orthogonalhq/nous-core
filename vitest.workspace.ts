import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'self/shared',
  'self/autonomic/config',
  'self/autonomic/runtime',
  'self/autonomic/storage',
  'self/autonomic/embeddings',
  'self/autonomic/health',
  'self/subcortex/providers',
  'self/subcortex/router',
  'self/subcortex/tools',
  'self/subcortex/projects',
  'self/subcortex/stubs',
  'self/memory/stm',
  'self/memory/mwc',
  'self/memory/stubs',
  'self/cortex/pfc',
  'self/cortex/core',
  'self/apps/web',
  'scripts/install',
]);
