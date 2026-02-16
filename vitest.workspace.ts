import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'self/shared',
  'self/autonomic/config',
  'self/autonomic/runtime',
  'self/autonomic/storage',
  'self/autonomic/embeddings',
  'self/autonomic/health',
]);
