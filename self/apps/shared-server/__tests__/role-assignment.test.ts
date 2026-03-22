import { describe, expect, it } from 'vitest';
import { ModelRoleSchema, type ModelRole, type ProviderId } from '@nous/shared';
import type { ModelRoleAssignment } from '@nous/autonomic-config';
import {
  OLLAMA_WELL_KNOWN_PROVIDER_ID,
  buildOllamaProviderConfig,
  currentReasonerAssignment,
  currentRoleAssignment,
  parseSelectedModelSpec,
  updateReasonerAssignment,
  updateRoleAssignment,
} from '../src/bootstrap';

const ROLE_PROVIDER_IDS: Record<ModelRole, ProviderId> = {
  orchestrator: '20000000-0000-0000-0000-000000000001' as ProviderId,
  reasoner: '20000000-0000-0000-0000-000000000002' as ProviderId,
  'tool-advisor': '20000000-0000-0000-0000-000000000003' as ProviderId,
  summarizer: '20000000-0000-0000-0000-000000000004' as ProviderId,
  embedder: '20000000-0000-0000-0000-000000000005' as ProviderId,
  reranker: '20000000-0000-0000-0000-000000000006' as ProviderId,
  vision: '20000000-0000-0000-0000-000000000007' as ProviderId,
};
const REPLACEMENT_PROVIDER_ID =
  '30000000-0000-0000-0000-000000000001' as ProviderId;
const FALLBACK_PROVIDER_ID = '30000000-0000-0000-0000-000000000002' as ProviderId;

function assignmentFor(
  role: ModelRole,
  providerId: ProviderId = ROLE_PROVIDER_IDS[role],
  fallbackProviderId?: ProviderId,
): ModelRoleAssignment {
  return {
    role,
    providerId,
    ...(fallbackProviderId ? { fallbackProviderId } : {}),
  };
}

function createMockContext(initialAssignments: ModelRoleAssignment[] = []) {
  const state = {
    modelRoleAssignments: [...initialAssignments],
  };

  return {
    state,
    ctx: {
      config: {
        get: () => ({
          modelRoleAssignments: [...state.modelRoleAssignments],
        }),
        update: async (section: string, value: unknown) => {
          if (section !== 'modelRoleAssignments') {
            throw new Error(`Unexpected config section update: ${section}`);
          }

          state.modelRoleAssignments = [...(value as ModelRoleAssignment[])];
        },
      },
    } as any,
  };
}

describe('parseSelectedModelSpec', () => {
  it('parses ollama model specs with multi-segment tags', () => {
    expect(parseSelectedModelSpec('ollama:llama3.2:3b')).toEqual({
      provider: 'ollama',
      modelId: 'llama3.2:3b',
    });
  });

  it('parses single-segment ollama model ids', () => {
    expect(parseSelectedModelSpec('ollama:mistral')).toEqual({
      provider: 'ollama',
      modelId: 'mistral',
    });
  });

  it('rejects empty model ids', () => {
    expect(parseSelectedModelSpec('ollama:')).toBeNull();
    expect(parseSelectedModelSpec('openai:')).toBeNull();
  });

  it('keeps existing cloud provider parsing intact', () => {
    expect(parseSelectedModelSpec('anthropic:claude-sonnet-4-20250514')).toEqual({
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
    });
    expect(parseSelectedModelSpec('openai:gpt-4o')).toEqual({
      provider: 'openai',
      modelId: 'gpt-4o',
    });
  });
});

describe('buildOllamaProviderConfig', () => {
  it('creates a local_text provider config with the well-known ollama provider id', () => {
    expect(buildOllamaProviderConfig('llama3.2:3b')).toEqual({
      id: OLLAMA_WELL_KNOWN_PROVIDER_ID,
      name: 'ollama',
      type: 'text',
      endpoint: 'http://localhost:11434',
      modelId: 'llama3.2:3b',
      isLocal: true,
      capabilities: ['chat', 'streaming'],
      providerClass: 'local_text',
    });
  });
});

describe('updateRoleAssignment', () => {
  it('accepts all 7 model roles and stores a separate assignment for each one', async () => {
    const { ctx, state } = createMockContext();

    for (const role of ModelRoleSchema.options as ModelRole[]) {
      await updateRoleAssignment(ctx, role, ROLE_PROVIDER_IDS[role]);
    }

    expect(state.modelRoleAssignments).toHaveLength(ModelRoleSchema.options.length);
    for (const role of ModelRoleSchema.options as ModelRole[]) {
      expect(currentRoleAssignment(ctx, role)).toEqual(assignmentFor(role));
    }
  });

  it('updates only the targeted role and preserves other assignments', async () => {
    const { ctx, state } = createMockContext([
      assignmentFor('reasoner'),
      assignmentFor('orchestrator'),
    ]);

    await updateRoleAssignment(
      ctx,
      'orchestrator',
      REPLACEMENT_PROVIDER_ID,
      FALLBACK_PROVIDER_ID,
    );

    expect(state.modelRoleAssignments).toEqual([
      assignmentFor('reasoner'),
      assignmentFor('orchestrator', REPLACEMENT_PROVIDER_ID, FALLBACK_PROVIDER_ID),
    ]);
  });

  it('removes only the targeted role when providerId is null', async () => {
    const { ctx, state } = createMockContext([
      assignmentFor('reasoner'),
      assignmentFor('orchestrator'),
    ]);

    await updateRoleAssignment(ctx, 'orchestrator', null);

    expect(state.modelRoleAssignments).toEqual([assignmentFor('reasoner')]);
    expect(currentRoleAssignment(ctx, 'orchestrator')).toBeUndefined();
  });

  it('returns undefined for unassigned roles', () => {
    const { ctx } = createMockContext([assignmentFor('reasoner')]);

    expect(currentRoleAssignment(ctx, 'vision')).toBeUndefined();
  });
});

describe('reasoner wrappers', () => {
  it('updateReasonerAssignment preserves other roles while updating reasoner', async () => {
    const { ctx, state } = createMockContext([assignmentFor('orchestrator')]);

    await updateReasonerAssignment(
      ctx,
      ROLE_PROVIDER_IDS.reasoner,
      FALLBACK_PROVIDER_ID,
    );

    expect(state.modelRoleAssignments).toEqual([
      assignmentFor('orchestrator'),
      assignmentFor('reasoner', ROLE_PROVIDER_IDS.reasoner, FALLBACK_PROVIDER_ID),
    ]);
  });

  it('currentReasonerAssignment reads the reasoner entry from multi-role config', () => {
    const { ctx } = createMockContext([
      assignmentFor('orchestrator'),
      assignmentFor('reasoner', ROLE_PROVIDER_IDS.reasoner, FALLBACK_PROVIDER_ID),
    ]);

    expect(currentReasonerAssignment(ctx)).toEqual(
      assignmentFor('reasoner', ROLE_PROVIDER_IDS.reasoner, FALLBACK_PROVIDER_ID),
    );
  });
});
