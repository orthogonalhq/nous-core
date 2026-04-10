import { describe, expect, it } from 'vitest';
import { ModelRoleSchema, type ModelRole, type ProviderId } from '@nous/shared';
import type { ModelRoleAssignment } from '@nous/autonomic-config';
import {
  OLLAMA_WELL_KNOWN_PROVIDER_ID,
  buildOllamaProviderConfig,
  currentRoleAssignment,
  parseSelectedModelSpec,
  updateRoleAssignment,
} from '../src/bootstrap';

const ROLE_PROVIDER_IDS: Record<ModelRole, ProviderId> = {
  'cortex-chat': '20000000-0000-0000-0000-000000000001' as ProviderId,
  'cortex-system': '20000000-0000-0000-0000-000000000002' as ProviderId,
  orchestrators: '20000000-0000-0000-0000-000000000003' as ProviderId,
  workers: '20000000-0000-0000-0000-000000000004' as ProviderId,
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
  it('accepts all 4 model roles and stores a separate assignment for each one', async () => {
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
      assignmentFor('cortex-chat'),
      assignmentFor('orchestrators'),
    ]);

    await updateRoleAssignment(
      ctx,
      'orchestrators',
      REPLACEMENT_PROVIDER_ID,
      FALLBACK_PROVIDER_ID,
    );

    expect(state.modelRoleAssignments).toEqual([
      assignmentFor('cortex-chat'),
      assignmentFor('orchestrators', REPLACEMENT_PROVIDER_ID, FALLBACK_PROVIDER_ID),
    ]);
  });

  it('removes only the targeted role when providerId is null', async () => {
    const { ctx, state } = createMockContext([
      assignmentFor('cortex-chat'),
      assignmentFor('orchestrators'),
    ]);

    await updateRoleAssignment(ctx, 'orchestrators', null);

    expect(state.modelRoleAssignments).toEqual([assignmentFor('cortex-chat')]);
    expect(currentRoleAssignment(ctx, 'orchestrators')).toBeUndefined();
  });

  it('returns undefined for unassigned roles', () => {
    const { ctx } = createMockContext([assignmentFor('cortex-chat')]);

    expect(currentRoleAssignment(ctx, 'workers')).toBeUndefined();
  });
});
