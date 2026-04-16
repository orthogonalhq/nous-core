import { describe, it, expect, vi } from 'vitest';
import type {
  IGatewayHealthSource,
  IProviderHealthSource,
  IEventBus,
  GatewayBootProjection,
  GatewayHealthProjection,
  SystemContextProjection,
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
    visibleTools: ['tool-a'],
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
      pressureTrend: 'stable',
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
      pressureTrend: 'stable',
    },
    issueCodes: [],
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

function createMockProviderSource(): IProviderHealthSource {
  return {
    listProviders: vi.fn(() => []),
  };
}

// --- Tests ---

describe('HealthAggregator — escalation/checkpoint population (Phase 1.2)', () => {
  describe('getSystemStatus()', () => {
    it('includes escalationCount, lastEscalationAt, lastEscalationSeverity from systemContext', () => {
      const gatewaySource = createMockGatewaySource({
        systemContext: createMockSystemContext({
          escalationCount: 5,
          lastEscalationAt: '2026-03-25T12:00:00.000Z',
          lastEscalationSeverity: 'critical',
        }),
      });
      const aggregator = new HealthAggregator({
        gatewayHealthSource: gatewaySource,
        providerHealthSource: createMockProviderSource(),
        eventBus: createMockEventBus(),
      });

      const status = aggregator.getSystemStatus();
      expect(status.escalationCount).toBe(5);
      expect(status.lastEscalationAt).toBe('2026-03-25T12:00:00.000Z');
      expect(status.lastEscalationSeverity).toBe('critical');
    });

    it('includes lastPreparedCheckpointId, lastCommittedCheckpointId, chainValid from systemContext', () => {
      const gatewaySource = createMockGatewaySource({
        systemContext: createMockSystemContext({
          lastPreparedCheckpointId: 'cp-prepared-001',
          lastCommittedCheckpointId: 'cp-committed-001',
          chainValid: true,
        }),
      });
      const aggregator = new HealthAggregator({
        gatewayHealthSource: gatewaySource,
        providerHealthSource: createMockProviderSource(),
        eventBus: createMockEventBus(),
      });

      const status = aggregator.getSystemStatus();
      expect(status.lastPreparedCheckpointId).toBe('cp-prepared-001');
      expect(status.lastCommittedCheckpointId).toBe('cp-committed-001');
      expect(status.chainValid).toBe(true);
    });

    it('returns undefined for escalation/checkpoint fields when systemContext has no values', () => {
      const gatewaySource = createMockGatewaySource({
        systemContext: createMockSystemContext(),
      });
      const aggregator = new HealthAggregator({
        gatewayHealthSource: gatewaySource,
        providerHealthSource: createMockProviderSource(),
        eventBus: createMockEventBus(),
      });

      const status = aggregator.getSystemStatus();
      expect(status.escalationCount).toBeUndefined();
      expect(status.lastEscalationAt).toBeUndefined();
      expect(status.lastEscalationSeverity).toBeUndefined();
      expect(status.lastPreparedCheckpointId).toBeUndefined();
      expect(status.lastCommittedCheckpointId).toBeUndefined();
      expect(status.chainValid).toBeUndefined();
    });
  });

  describe('getAgentStatus()', () => {
    it('includes escalationCount, lastEscalationAt, lastEscalationSeverity from systemHealth projection', () => {
      const gatewaySource = createMockGatewaySource({
        systemHealth: createMockGatewayHealth('Cortex::System', {
          escalationCount: 3,
          lastEscalationAt: '2026-03-25T14:00:00.000Z',
          lastEscalationSeverity: 'high',
        }),
      });
      const aggregator = new HealthAggregator({
        gatewayHealthSource: gatewaySource,
        providerHealthSource: createMockProviderSource(),
        eventBus: createMockEventBus(),
      });

      const status = aggregator.getAgentStatus();
      expect(status.escalationCount).toBe(3);
      expect(status.lastEscalationAt).toBe('2026-03-25T14:00:00.000Z');
      expect(status.lastEscalationSeverity).toBe('high');
    });

    it('returns undefined for escalation fields when systemHealth has no escalation data', () => {
      const gatewaySource = createMockGatewaySource({
        systemHealth: createMockGatewayHealth('Cortex::System'),
      });
      const aggregator = new HealthAggregator({
        gatewayHealthSource: gatewaySource,
        providerHealthSource: createMockProviderSource(),
        eventBus: createMockEventBus(),
      });

      const status = aggregator.getAgentStatus();
      expect(status.escalationCount).toBeUndefined();
      expect(status.lastEscalationAt).toBeUndefined();
      expect(status.lastEscalationSeverity).toBeUndefined();
    });
  });
});
