import { describe, it, expect, vi } from 'vitest';
import { NousError } from '@nous/shared';
import { ModelRouter } from '../model-router.js';

const createMockConfig = (overrides: Record<string, unknown> = {}) => ({
  get: vi.fn().mockReturnValue({
    modelRoleAssignments: [
      { role: 'cortex-chat', providerId: '00000000-0000-0000-0000-000000000001' },
    ],
    providers: [
      {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Ollama',
        type: 'text',
        modelId: 'llama3.2',
        isLocal: true,
        capabilities: ['text'],
      },
    ],
    profile: { name: 'hybrid' },
    ...overrides,
  }),
});

describe('ModelRouter', () => {
  it('implements IModelRouter — route returns ProviderId', async () => {
    const config = createMockConfig();
    const router = new ModelRouter(config as any);

    const providerId = await router.route('cortex-chat');
    expect(providerId).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('route() throws ROLE_NOT_ASSIGNED when no assignment', async () => {
    const config = createMockConfig({ modelRoleAssignments: [] });
    const router = new ModelRouter(config as any);

    await expect(router.route('cortex-chat')).rejects.toThrow(NousError);
    try {
      await router.route('cortex-chat');
    } catch (e) {
      expect((e as NousError).code).toBe('ROLE_NOT_ASSIGNED');
    }
  });

  it('route() throws ROLE_NOT_ASSIGNED when role not in assignments', async () => {
    const config = createMockConfig({
      modelRoleAssignments: [
        { role: 'workers', providerId: '00000000-0000-0000-0000-000000000001' },
      ],
    });
    const router = new ModelRouter(config as any);

    await expect(router.route('cortex-chat')).rejects.toThrow(NousError);
    try {
      await router.route('cortex-chat');
    } catch (e) {
      expect((e as NousError).code).toBe('ROLE_NOT_ASSIGNED');
    }
  });

  it('route() throws PROVIDER_NOT_FOUND when provider not in config', async () => {
    const config = createMockConfig({
      modelRoleAssignments: [
        { role: 'cortex-chat', providerId: '00000000-0000-0000-0000-000000000099' },
      ],
      providers: [],
    });
    const router = new ModelRouter(config as any);

    await expect(router.route('cortex-chat')).rejects.toThrow(NousError);
    try {
      await router.route('cortex-chat');
    } catch (e) {
      expect((e as NousError).code).toBe('PROVIDER_NOT_FOUND');
    }
  });

  it('listProviders() returns ModelProviderConfig[]', async () => {
    const config = createMockConfig();
    const router = new ModelRouter(config as any);

    const list = await router.listProviders();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toHaveProperty('id');
    expect(list[0]).toHaveProperty('name');
    expect(list[0]).toHaveProperty('modelId');
  });
});

describe('ModelRouter routeWithEvidence', () => {
  const TRACE_ID =
    '00000000-0000-0000-0000-000000000000' as import('@nous/shared').TraceId;
  const PROVIDER_ID = '00000000-0000-0000-0000-000000000001' as const;
  const FALLBACK_ID = '00000000-0000-0000-0000-000000000002' as const;

  it('returns providerId and evidence', async () => {
    const config = createMockConfig();
    const router = new ModelRouter(config as any);

    const result = await router.routeWithEvidence('cortex-chat', {
      traceId: TRACE_ID,
      modelRequirements: {
        profile: 'review-standard',
        fallbackPolicy: 'block_if_unmet',
      },
    });

    expect(result.providerId).toBe(PROVIDER_ID);
    expect(result.evidence).toBeDefined();
    expect(result.evidence.profileId).toBe('hybrid_controlled');
    expect(result.evidence.policyLink).toBe('block_if_unmet');
    expect(result.evidence.capabilityProfile).toBe('review-standard');
    expect(result.evidence.selectedProviderId).toBe(PROVIDER_ID);
  });

  it('profile boundary blocks local_strict + remote primary provider', async () => {
    const config = createMockConfig({
      profile: {
        name: 'local_strict',
        description: 'Local only',
        defaultProviderType: 'local',
        allowLocalProviders: true,
        allowRemoteProviders: false,
        allowSilentLocalToRemoteFailover: false,
      },
      providers: [
        {
          id: FALLBACK_ID,
          name: 'OpenAI',
          type: 'text',
          modelId: 'gpt-4',
          isLocal: false,
          capabilities: ['text'],
        },
      ],
      modelRoleAssignments: [
        { role: 'cortex-chat', providerId: FALLBACK_ID },
      ],
    });
    const router = new ModelRouter(config as any);

    await expect(
      router.routeWithEvidence('cortex-chat', {
        traceId: TRACE_ID,
        modelRequirements: {
          profile: 'review-standard',
          fallbackPolicy: 'block_if_unmet',
        },
      }),
    ).rejects.toThrow(NousError);

    try {
      await router.routeWithEvidence('cortex-chat', {
        traceId: TRACE_ID,
        modelRequirements: {
          profile: 'review-standard',
          fallbackPolicy: 'block_if_unmet',
        },
      });
    } catch (e) {
      expect((e as NousError).context?.failoverReasonCode).toBe(
        'PRV-PROFILE-BOUNDARY',
      );
    }
  });

  it('hybrid_controlled allows fallback when configured', async () => {
    const config = createMockConfig({
      profile: {
        name: 'hybrid_controlled',
        description: 'Hybrid',
        defaultProviderType: 'local',
        allowLocalProviders: true,
        allowRemoteProviders: true,
        allowSilentLocalToRemoteFailover: false,
      },
      providers: [
        {
          id: PROVIDER_ID,
          name: 'Ollama',
          type: 'text',
          modelId: 'llama',
          isLocal: true,
          capabilities: ['text'],
        },
        {
          id: FALLBACK_ID,
          name: 'OpenAI',
          type: 'text',
          modelId: 'gpt-4',
          isLocal: false,
          capabilities: ['text'],
        },
      ],
      modelRoleAssignments: [
        {
          role: 'cortex-chat',
          providerId: PROVIDER_ID,
          fallbackProviderId: FALLBACK_ID,
        },
      ],
    });
    const router = new ModelRouter(config as any);

    const result = await router.routeWithEvidence('cortex-chat', {
      traceId: TRACE_ID,
      modelRequirements: {
        profile: 'review-standard',
        fallbackPolicy: 'block_if_unmet',
      },
    });

    expect(result.providerId).toBe(PROVIDER_ID);
    expect(result.evidence.failoverHop).toBe(0);
  });

  it('throws PRV-THRESHOLD-MISS when no provider meets profile', async () => {
    const config = createMockConfig({
      providers: [
        {
          id: PROVIDER_ID,
          name: 'Ollama',
          type: 'text',
          modelId: 'llama',
          isLocal: true,
          capabilities: ['text'],
          meetsProfiles: ['prompt-generation'],
        },
      ],
      modelRoleAssignments: [{ role: 'cortex-chat', providerId: PROVIDER_ID }],
    });
    const router = new ModelRouter(config as any);

    await expect(
      router.routeWithEvidence('cortex-chat', {
        traceId: TRACE_ID,
        modelRequirements: {
          profile: 'review-standard',
          fallbackPolicy: 'block_if_unmet',
        },
      }),
    ).rejects.toThrow(NousError);

    try {
      await router.routeWithEvidence('cortex-chat', {
        traceId: TRACE_ID,
        modelRequirements: {
          profile: 'review-standard',
          fallbackPolicy: 'block_if_unmet',
        },
      });
    } catch (e) {
      expect((e as NousError).context?.failoverReasonCode).toBe(
        'PRV-THRESHOLD-MISS',
      );
    }
  });

  it('principalOverrideEvidence allows dispatch with PRV-PRINCIPAL-OVERRIDE', async () => {
    const config = createMockConfig({
      providers: [
        {
          id: PROVIDER_ID,
          name: 'Ollama',
          type: 'text',
          modelId: 'llama',
          isLocal: true,
          capabilities: ['text'],
          meetsProfiles: ['prompt-generation'],
        },
      ],
      modelRoleAssignments: [{ role: 'cortex-chat', providerId: PROVIDER_ID }],
    });
    const router = new ModelRouter(config as any);

    const result = await router.routeWithEvidence('cortex-chat', {
      traceId: TRACE_ID,
      modelRequirements: {
        profile: 'review-standard',
        fallbackPolicy: 'block_if_unmet',
      },
      principalOverrideEvidence: true,
    });

    expect(result.providerId).toBe(PROVIDER_ID);
    expect(result.evidence.failoverReasonCode).toBe('PRV-PRINCIPAL-OVERRIDE');
  });
});
