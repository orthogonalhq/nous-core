import { describe, it, expect } from 'vitest';
import { migrateLegacyModelRole } from '../../types/model-role-migration.js';

describe('migrateLegacyModelRole', () => {
  it('remaps "reasoner" to "cortex-chat"', () => {
    expect(migrateLegacyModelRole('reasoner')).toBe('cortex-chat');
  });

  it('remaps "orchestrator" to "orchestrators"', () => {
    expect(migrateLegacyModelRole('orchestrator')).toBe('orchestrators');
  });

  it.each(['tool-advisor', 'summarizer', 'embedder', 'reranker', 'vision'])(
    'returns null for dropped literal "%s"',
    (role) => {
      expect(migrateLegacyModelRole(role)).toBeNull();
    },
  );

  it.each(['cortex-chat', 'cortex-system', 'orchestrators', 'workers'])(
    'passes through canonical literal "%s" unchanged',
    (role) => {
      expect(migrateLegacyModelRole(role)).toBe(role);
    },
  );

  it('passes through unrecognized strings unchanged', () => {
    expect(migrateLegacyModelRole('fantasy-role')).toBe('fantasy-role');
  });

  it('is idempotent — double-migration does not corrupt', () => {
    const first = migrateLegacyModelRole('reasoner');
    expect(first).toBe('cortex-chat');
    expect(migrateLegacyModelRole(first as string)).toBe('cortex-chat');
  });
});
