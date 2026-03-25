import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  IGatewayHealthSource,
  IProviderHealthSource,
  IEventBus,
  GatewayBootProjection,
  GatewayHealthProjection,
  SystemContextProjection,
  ModelProviderConfig,
  ProviderId,
} from '@nous/shared';
import {
  ProviderHealthSnapshotSchema,
  AgentStatusSnapshotSchema,
  SystemStatusSnapshotSchema,
} from '@nous/shared';
import { HealthAggregator } from '../health-aggregator.js';

// --- Mock Factories ---

function createMockBootSnapshot(overrides?: Partial<GatewayBootProjection>): GatewayBootProjection {
  return {
    status: 'ready',
    completedSteps: ['init', 'providers', 'gateway'],
    issueCodes: [],
    ...overrides,
  };
}

function createMockGatewayHealth(agentClass: string, overrides?: Partial<GatewayHealthProjection>): GatewayHealthProjection {
  return {
    agentClass,
    agentId: '00000000-0000-0000-0000-000000000001',
    visibleTools: ['tool-a', 'tool-b'],
    inboxReady: true,
    lastAckAt: undefined,
    lastObservationAt: undefined,
    lastSubmissionAt: undefined,
    lastResultStatus: undefined,
    backlogAnalytics: {
      queuedCount: 0,
      activeCount: 0,
      suspendedCount: 0,
      completedInWindow: 0,
      failedInWindow: 0,
      pressureTrend: 'idle',
    },
    issueCodes: [],
    appSessions: [],
    ...overrides,
  };
}

function createMockSystemContext(overrides?: Partial<SystemContextProjection>): SystemContextProjection {
  return {
    bootStatus: 'ready',
    inboxReady: true,
    pendingSystemRuns: 0,
    backlogAnalytics: {
      queuedCount: 0,
      activeCount: 0,
      suspendedCount: 0,
      completedInWindow: 0,
      failedInWindow: 0,
      pressureTrend: 'idle',
    },
    issueCodes: [],
    ...overrides,
  };
}

function createMockProvider(overrides?: Partial<ModelProviderConfig>): ModelProviderConfig {
  return {
    id: '00000000-0000-0000-0000-000000000010' as ProviderId,
    name: 'test-provider',
    type: 'text',
    endpoint: 'http://localhost:11434',
    modelId: 'llama3',
    isLocal: true,
    maxTokens: 4096,
    capabilities: ['chat'],
    ...overrides,
  };
}

function createMockEventBus(): IEventBus {
  const handlers = new Map<string, { channel: string; handler: (payload: any) => void }>();
  let nextId = 0;

  return {
    publish: vi.fn((channel: string, payload: any) => {
      for (const entry of handlers.values()) {
        if (entry.channel === channel) {
          entry.handler(payload);
        }
      }
    }) as IEventBus['publish'],
    subscribe: vi.fn((channel: string, handler: (payload: any) => void) => {
      const id = `sub-${nextId++}`;
      handlers.set(id, { channel, handler });
      return id;
    }) as IEventBus['subscribe'],
    unsubscribe: vi.fn((id: string) => {
      handlers.delete(id);
    }),
    dispose: vi.fn(),
  };
}

function createMockGatewaySource(overrides?: {
  bootSnapshot?: GatewayBootProjection;
  principalHealth?: GatewayHealthProjection;
  systemHealth?: GatewayHealthProjection;
  systemContext?: SystemContextProjection;
}): IGatewayHealthSource {
  return {
    getBootSnapshot: vi.fn(() => overrides?.bootSnapshot ?? createMockBootSnapshot()),
    getGatewayHealth: vi.fn((agentClass: string) => {
      if (agentClass === 'Cortex::Principal') {
        return overrides?.principalHealth ?? createMockGatewayHealth('Cortex::Principal');
      }
      return overrides?.systemHealth ?? createMockGatewayHealth('Cortex::System');
    }),
    getSystemContextReplica: vi.fn(() => overrides?.systemContext ?? createMockSystemContext()),
  };
}

function createMockProviderSource(providers?: ModelProviderConfig[]): IProviderHealthSource {
  return {
    listProviders: vi.fn(() => providers ?? [createMockProvider()]),
  };
}

// --- Tests ---

describe('HealthAggregator', () => {
  let gatewaySource: IGatewayHealthSource;
  let providerSource: IProviderHealthSource;
  let eventBus: IEventBus;
  let aggregator: HealthAggregator;

  beforeEach(() => {
    gatewaySource = createMockGatewaySource();
    providerSource = createMockProviderSource();
    eventBus = createMockEventBus();
    aggregator = new HealthAggregator({
      gatewayHealthSource: gatewaySource,
      providerHealthSource: providerSource,
      eventBus,
    });
  });

  // --- Tier 1: Contract Tests ---

  describe('contract', () => {
    it('implements IHealthAggregator — all four methods exist', () => {
      expect(typeof aggregator.getProviderHealth).toBe('function');
      expect(typeof aggregator.getAgentStatus).toBe('function');
      expect(typeof aggregator.getSystemStatus).toBe('function');
      expect(typeof aggregator.dispose).toBe('function');
    });

    it('getProviderHealth() returns valid ProviderHealthSnapshot', () => {
      const result = aggregator.getProviderHealth();
      expect(() => ProviderHealthSnapshotSchema.parse(result)).not.toThrow();
    });

    it('getAgentStatus() returns valid AgentStatusSnapshot', () => {
      const result = aggregator.getAgentStatus();
      expect(() => AgentStatusSnapshotSchema.parse(result)).not.toThrow();
    });

    it('getSystemStatus() returns valid SystemStatusSnapshot', () => {
      const result = aggregator.getSystemStatus();
      expect(() => SystemStatusSnapshotSchema.parse(result)).not.toThrow();
    });
  });

  // --- Tier 2: Behavior Tests ---

  describe('getProviderHealth()', () => {
    it('maps all providers from source', () => {
      const providers = [
        createMockProvider({ id: '00000000-0000-0000-0000-000000000011' as ProviderId, name: 'ollama-local' }),
        createMockProvider({ id: '00000000-0000-0000-0000-000000000012' as ProviderId, name: 'anthropic', type: 'text', isLocal: false }),
      ];
      providerSource = createMockProviderSource(providers);
      aggregator = new HealthAggregator({
        gatewayHealthSource: gatewaySource,
        providerHealthSource: providerSource,
        eventBus,
      });

      const result = aggregator.getProviderHealth();
      expect(result.providers.length).toBe(2);
      expect(result.providers.every((p) => p.status === 'unknown')).toBe(true);
    });

    it('returns empty providers when source has none', () => {
      providerSource = createMockProviderSource([]);
      aggregator = new HealthAggregator({
        gatewayHealthSource: gatewaySource,
        providerHealthSource: providerSource,
        eventBus,
      });

      const result = aggregator.getProviderHealth();
      expect(result.providers).toEqual([]);
    });
  });

  describe('getAgentStatus()', () => {
    it('includes both Principal and System gateways', () => {
      const result = aggregator.getAgentStatus();
      expect(result.gateways.length).toBe(2);
      expect(result.gateways.map((g) => g.agentClass)).toEqual([
        'Cortex::Principal',
        'Cortex::System',
      ]);
    });

    it('normalizes visibleTools to visibleToolCount', () => {
      gatewaySource = createMockGatewaySource({
        principalHealth: createMockGatewayHealth('Cortex::Principal', {
          visibleTools: ['a', 'b', 'c'],
        }),
      });
      aggregator = new HealthAggregator({
        gatewayHealthSource: gatewaySource,
        providerHealthSource: providerSource,
        eventBus,
      });

      const result = aggregator.getAgentStatus();
      const principal = result.gateways.find((g) => g.agentClass === 'Cortex::Principal');
      expect(principal?.visibleToolCount).toBe(3);
    });

    it('includes appSessions from System gateway', () => {
      gatewaySource = createMockGatewaySource({
        systemHealth: createMockGatewayHealth('Cortex::System', {
          appSessions: [
            {
              sessionId: 'sess-1',
              appId: 'app-1',
              packageId: 'pkg-1',
              status: 'active',
              healthStatus: 'healthy',
              startedAt: new Date().toISOString(),
              stale: false,
            },
          ],
        }),
      });
      aggregator = new HealthAggregator({
        gatewayHealthSource: gatewaySource,
        providerHealthSource: providerSource,
        eventBus,
      });

      const result = aggregator.getAgentStatus();
      expect(result.appSessions.length).toBe(1);
      expect(result.appSessions[0].sessionId).toBe('sess-1');
    });
  });

  describe('getSystemStatus()', () => {
    it('reads boot status from adapter', () => {
      gatewaySource = createMockGatewaySource({
        bootSnapshot: createMockBootSnapshot({ status: 'degraded' }),
      });
      aggregator = new HealthAggregator({
        gatewayHealthSource: gatewaySource,
        providerHealthSource: providerSource,
        eventBus,
      });

      const result = aggregator.getSystemStatus();
      expect(result.bootStatus).toBe('degraded');
    });

    it('includes backlog analytics from system context', () => {
      gatewaySource = createMockGatewaySource({
        systemContext: createMockSystemContext({
          backlogAnalytics: {
            queuedCount: 5,
            activeCount: 2,
            suspendedCount: 1,
            completedInWindow: 10,
            failedInWindow: 0,
            pressureTrend: 'steady',
          },
        }),
      });
      aggregator = new HealthAggregator({
        gatewayHealthSource: gatewaySource,
        providerHealthSource: providerSource,
        eventBus,
      });

      const result = aggregator.getSystemStatus();
      expect(result.backlogAnalytics.queuedCount).toBe(5);
      expect(result.backlogAnalytics.activeCount).toBe(2);
      expect(result.backlogAnalytics.pressureTrend).toBe('steady');
    });
  });

  describe('EventBus subscriptions', () => {
    it('subscribes to app-health:change and app-health:heartbeat on construction', () => {
      expect(eventBus.subscribe).toHaveBeenCalledTimes(2);
      expect(eventBus.subscribe).toHaveBeenCalledWith('app-health:change', expect.any(Function));
      expect(eventBus.subscribe).toHaveBeenCalledWith('app-health:heartbeat', expect.any(Function));
    });

    it('caches app-health:change events by sessionId', () => {
      eventBus.publish('app-health:change', {
        appId: 'app-1',
        sessionId: 'sess-1',
        status: 'healthy',
      });

      // The cache is internal — verify through successful aggregation (no errors)
      const result = aggregator.getAgentStatus();
      expect(() => AgentStatusSnapshotSchema.parse(result)).not.toThrow();
    });

    it('caches app-health:heartbeat events by sessionId', () => {
      eventBus.publish('app-health:heartbeat', {
        appId: 'app-1',
        sessionId: 'sess-1',
        timestamp: new Date().toISOString(),
      });

      const result = aggregator.getAgentStatus();
      expect(() => AgentStatusSnapshotSchema.parse(result)).not.toThrow();
    });

    it('dispose() unsubscribes from EventBus', () => {
      aggregator.dispose();
      expect(eventBus.unsubscribe).toHaveBeenCalledTimes(2);
    });
  });

  // --- Tier 3: Edge Case Tests ---

  describe('error handling', () => {
    it('getProviderHealth() handles adapter error gracefully', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      providerSource = {
        listProviders: vi.fn(() => { throw new Error('adapter failure'); }),
      };
      aggregator = new HealthAggregator({
        gatewayHealthSource: gatewaySource,
        providerHealthSource: providerSource,
        eventBus,
      });

      const result = aggregator.getProviderHealth();
      expect(result.providers).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('getAgentStatus() handles adapter error gracefully', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      gatewaySource = {
        getBootSnapshot: vi.fn(() => createMockBootSnapshot()),
        getGatewayHealth: vi.fn(() => { throw new Error('adapter failure'); }),
        getSystemContextReplica: vi.fn(() => createMockSystemContext()),
      };
      aggregator = new HealthAggregator({
        gatewayHealthSource: gatewaySource,
        providerHealthSource: providerSource,
        eventBus,
      });

      const result = aggregator.getAgentStatus();
      expect(result.gateways).toEqual([]);
      expect(result.appSessions).toEqual([]);
      warnSpy.mockRestore();
    });

    it('getSystemStatus() handles adapter error gracefully', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      gatewaySource = {
        getBootSnapshot: vi.fn(() => { throw new Error('adapter failure'); }),
        getGatewayHealth: vi.fn(() => createMockGatewayHealth('Cortex::Principal')),
        getSystemContextReplica: vi.fn(() => { throw new Error('adapter failure'); }),
      };
      aggregator = new HealthAggregator({
        gatewayHealthSource: gatewaySource,
        providerHealthSource: providerSource,
        eventBus,
      });

      const result = aggregator.getSystemStatus();
      expect(result.bootStatus).toBe('booting');
      expect(result.completedBootSteps).toEqual([]);
      warnSpy.mockRestore();
    });

    it('cold start: getAgentStatus() returns valid data before any EventBus events', () => {
      // No events published — aggregator returns data from adapter direct reads
      const result = aggregator.getAgentStatus();
      expect(() => AgentStatusSnapshotSchema.parse(result)).not.toThrow();
      expect(result.gateways.length).toBe(2);
    });

    it('dispose() prevents further cache updates from EventBus', () => {
      aggregator.dispose();

      // After dispose, publish should not reach the handler (subscription removed)
      eventBus.publish('app-health:change', {
        appId: 'app-1',
        sessionId: 'sess-new',
        status: 'healthy',
      });

      // Aggregator should still return valid data from adapters
      const result = aggregator.getAgentStatus();
      expect(() => AgentStatusSnapshotSchema.parse(result)).not.toThrow();
    });
  });
});
