import { describe, it, expect, vi } from 'vitest';
import { NousError } from '@nous/shared';
import { ModelRouter } from '../model-router.js';

const createMockConfig = (overrides: Record<string, unknown> = {}) => ({
  get: vi.fn().mockReturnValue({
    modelRoleAssignments: [
      { role: 'reasoner', providerId: '00000000-0000-0000-0000-000000000001' },
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

    const providerId = await router.route('reasoner');
    expect(providerId).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('route() throws ROLE_NOT_ASSIGNED when no assignment', async () => {
    const config = createMockConfig({ modelRoleAssignments: [] });
    const router = new ModelRouter(config as any);

    await expect(router.route('reasoner')).rejects.toThrow(NousError);
    try {
      await router.route('reasoner');
    } catch (e) {
      expect((e as NousError).code).toBe('ROLE_NOT_ASSIGNED');
    }
  });

  it('route() throws ROLE_NOT_ASSIGNED when role not in assignments', async () => {
    const config = createMockConfig({
      modelRoleAssignments: [
        { role: 'summarizer', providerId: '00000000-0000-0000-0000-000000000001' },
      ],
    });
    const router = new ModelRouter(config as any);

    await expect(router.route('reasoner')).rejects.toThrow(NousError);
    try {
      await router.route('reasoner');
    } catch (e) {
      expect((e as NousError).code).toBe('ROLE_NOT_ASSIGNED');
    }
  });

  it('route() throws PROVIDER_NOT_FOUND when provider not in config', async () => {
    const config = createMockConfig({
      modelRoleAssignments: [
        { role: 'reasoner', providerId: '00000000-0000-0000-0000-000000000099' },
      ],
      providers: [],
    });
    const router = new ModelRouter(config as any);

    await expect(router.route('reasoner')).rejects.toThrow(NousError);
    try {
      await router.route('reasoner');
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
