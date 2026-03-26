import { describe, it, expect, vi } from 'vitest';
import type {
  IHealthAggregator,
  ProviderHealthSnapshot,
  AgentStatusSnapshot,
  SystemStatusSnapshot,
} from '@nous/shared';
import {
  HealthReportSchema,
  SystemMetricsSchema,
} from '@nous/shared';
import { HealthMonitor } from '../health-monitor.js';

// --- Mock Factory ---

function createDefaultSystemStatus(): SystemStatusSnapshot {
  return {
    bootStatus: 'ready',
    completedBootSteps: ['init', 'providers', 'gateway'],
    issueCodes: [],
    inboxReady: true,
    pendingSystemRuns: 0,
    backlogAnalytics: {
      queuedCount: 0,
      activeCount: 0,
      suspendedCount: 0,
      completedInWindow: 0,
      failedInWindow: 0,
      pressureTrend: 'stable' as const,
    },
    collectedAt: new Date().toISOString(),
  };
}

function createDefaultAgentStatus(): AgentStatusSnapshot {
  return {
    gateways: [
      {
        agentClass: 'Cortex::Principal',
        agentId: '00000000-0000-0000-0000-000000000001',
        inboxReady: true,
        visibleToolCount: 2,
        issueCount: 0,
        issueCodes: [],
      },
      {
        agentClass: 'Cortex::System',
        agentId: '00000000-0000-0000-0000-000000000002',
        inboxReady: true,
        visibleToolCount: 1,
        issueCount: 0,
        issueCodes: [],
      },
    ],
    appSessions: [],
    collectedAt: new Date().toISOString(),
  };
}

function createDefaultProviderHealth(): ProviderHealthSnapshot {
  return {
    providers: [],
    collectedAt: new Date().toISOString(),
  };
}

function createMockAggregator(overrides?: {
  providerHealth?: ProviderHealthSnapshot;
  agentStatus?: AgentStatusSnapshot;
  systemStatus?: SystemStatusSnapshot;
}): IHealthAggregator {
  return {
    getProviderHealth: vi.fn((): ProviderHealthSnapshot =>
      overrides?.providerHealth ?? createDefaultProviderHealth(),
    ),
    getAgentStatus: vi.fn((): AgentStatusSnapshot =>
      overrides?.agentStatus ?? createDefaultAgentStatus(),
    ),
    getSystemStatus: vi.fn((): SystemStatusSnapshot =>
      overrides?.systemStatus ?? createDefaultSystemStatus(),
    ),
    dispose: vi.fn(),
  };
}

// --- Tests ---

describe('HealthMonitor', () => {
  // --- Tier 1: Contract Tests ---

  describe('contract', () => {
    it('implements IHealthMonitor — check() and getMetrics() exist', () => {
      const monitor = new HealthMonitor({ aggregator: createMockAggregator() });
      expect(typeof monitor.check).toBe('function');
      expect(typeof monitor.getMetrics).toBe('function');
    });

    it('check() returns valid HealthReport', async () => {
      const monitor = new HealthMonitor({ aggregator: createMockAggregator() });
      const result = await monitor.check();
      expect(() => HealthReportSchema.parse(result)).not.toThrow();
    });

    it('getMetrics() returns valid SystemMetrics', async () => {
      const monitor = new HealthMonitor({ aggregator: createMockAggregator() });
      const result = await monitor.getMetrics();
      expect(() => SystemMetricsSchema.parse(result)).not.toThrow();
    });
  });

  // --- Tier 2: Behavior Tests ---

  describe('check()', () => {
    it('delegates to aggregator for health data', async () => {
      const aggregator = createMockAggregator();
      const monitor = new HealthMonitor({ aggregator });

      await monitor.check();

      expect(aggregator.getSystemStatus).toHaveBeenCalled();
      expect(aggregator.getAgentStatus).toHaveBeenCalled();
    });

    it('returns healthy:true when boot status is ready and no issues', async () => {
      const monitor = new HealthMonitor({
        aggregator: createMockAggregator({
          systemStatus: createDefaultSystemStatus(),
        }),
      });

      const result = await monitor.check();
      expect(result.healthy).toBe(true);
    });

    it('returns healthy:false when boot status is booting', async () => {
      const monitor = new HealthMonitor({
        aggregator: createMockAggregator({
          systemStatus: {
            ...createDefaultSystemStatus(),
            bootStatus: 'booting' as const,
            completedBootSteps: ['init'],
            inboxReady: false,
          },
        }),
      });

      const result = await monitor.check();
      expect(result.healthy).toBe(false);
      const bootComponent = result.components.find((c) => c.name === 'boot');
      expect(bootComponent?.status).toBe('degraded');
    });

    it('returns healthy:false when boot status is degraded', async () => {
      const monitor = new HealthMonitor({
        aggregator: createMockAggregator({
          systemStatus: {
            ...createDefaultSystemStatus(),
            bootStatus: 'degraded' as const,
            completedBootSteps: ['init', 'providers'],
            issueCodes: ['PROVIDER_INIT_FAILED'],
          },
        }),
      });

      const result = await monitor.check();
      expect(result.healthy).toBe(false);
      const bootComponent = result.components.find((c) => c.name === 'boot');
      expect(bootComponent?.status).toBe('unhealthy');
    });
  });

  describe('getMetrics()', () => {
    it('returns real uptimeSeconds and memoryUsageMb', async () => {
      const monitor = new HealthMonitor({ aggregator: createMockAggregator() });
      const result = await monitor.getMetrics();
      expect(result.uptimeSeconds).toBeGreaterThan(0);
      expect(result.memoryUsageMb).toBeGreaterThan(0);
    });

    it('returns 0 for storageUsageMb, activeProjects, totalMemoryEntries', async () => {
      const monitor = new HealthMonitor({ aggregator: createMockAggregator() });
      const result = await monitor.getMetrics();
      expect(result.storageUsageMb).toBe(0);
      expect(result.activeProjects).toBe(0);
      expect(result.totalMemoryEntries).toBe(0);
    });
  });
});
