import { describe, expect, it, vi } from 'vitest';
import { createGatewayProjectApi } from '../../gateway-runtime/project-api.js';
import type { GatewayRuntimeProjectApiDeps, MemoryReadService } from '../../gateway-runtime/project-api.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440104' as any;

function createMinimalDeps(overrides?: Partial<GatewayRuntimeProjectApiDeps>): GatewayRuntimeProjectApiDeps {
  return {
    mwcPipeline: { submit: vi.fn().mockResolvedValue(null) },
    artifactStore: {
      store: vi.fn(),
      retrieve: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
    } as any,
    escalationService: {
      notify: vi.fn().mockResolvedValue('escalation-1'),
    } as any,
    schedulerService: {
      register: vi.fn(),
      cancel: vi.fn(),
    } as any,
    toolExecutor: {
      execute: vi.fn(),
      listTools: vi.fn().mockResolvedValue([]),
    } as any,
    router: {
      routeWithEvidence: vi.fn(),
    } as any,
    getProvider: vi.fn().mockReturnValue(null),
    ...overrides,
  };
}

describe('createGatewayProjectApi memory delegation', () => {
  it('memory.read delegates to memoryReadService when available', async () => {
    const memoryReadService: MemoryReadService = {
      read: vi.fn().mockResolvedValue([{ id: 'entry-1', content: 'test' }]),
      retrieve: vi.fn().mockResolvedValue([]),
    };
    const api = createGatewayProjectApi(PROJECT_ID, createMinimalDeps({ memoryReadService }));

    const result = await api.memory.read('test query', 'project');

    expect(result).toEqual([{ id: 'entry-1', content: 'test' }]);
    expect(memoryReadService.read).toHaveBeenCalledWith('test query', 'project', PROJECT_ID);
  });

  it('memory.read returns empty array when memoryReadService is null', async () => {
    const api = createGatewayProjectApi(PROJECT_ID, createMinimalDeps({ memoryReadService: null }));

    const result = await api.memory.read('test query', 'project');

    expect(result).toEqual([]);
  });

  it('memory.read returns empty array when memoryReadService is undefined', async () => {
    const api = createGatewayProjectApi(PROJECT_ID, createMinimalDeps());

    const result = await api.memory.read('test query', 'project');

    expect(result).toEqual([]);
  });

  it('memory.read returns empty array when memoryReadService.read throws', async () => {
    const memoryReadService: MemoryReadService = {
      read: vi.fn().mockRejectedValue(new Error('store crashed')),
      retrieve: vi.fn(),
    };
    const api = createGatewayProjectApi(PROJECT_ID, createMinimalDeps({ memoryReadService }));

    const result = await api.memory.read('test query', 'project');

    expect(result).toEqual([]);
  });

  it('memory.retrieve delegates to memoryReadService when available', async () => {
    const memoryReadService: MemoryReadService = {
      read: vi.fn(),
      retrieve: vi.fn().mockResolvedValue([{ score: 0.9, content: 'relevant' }]),
    };
    const api = createGatewayProjectApi(PROJECT_ID, createMinimalDeps({ memoryReadService }));

    const result = await api.memory.retrieve('test situation', 100);

    expect(result).toEqual([{ score: 0.9, content: 'relevant' }]);
    expect(memoryReadService.retrieve).toHaveBeenCalledWith('test situation', 100, PROJECT_ID);
  });

  it('memory.retrieve returns empty array when memoryReadService is null', async () => {
    const api = createGatewayProjectApi(PROJECT_ID, createMinimalDeps({ memoryReadService: null }));

    const result = await api.memory.retrieve('test situation', 100);

    expect(result).toEqual([]);
  });

  it('memory.retrieve returns empty array when memoryReadService.retrieve throws', async () => {
    const memoryReadService: MemoryReadService = {
      read: vi.fn(),
      retrieve: vi.fn().mockRejectedValue(new TypeError('cannot read properties of null')),
    };
    const api = createGatewayProjectApi(PROJECT_ID, createMinimalDeps({ memoryReadService }));

    const result = await api.memory.retrieve('test situation', 100);

    expect(result).toEqual([]);
  });
});
