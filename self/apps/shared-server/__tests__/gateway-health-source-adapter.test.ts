/**
 * Unit tests for GatewayHealthSourceAdapter (SP 1.2).
 *
 * Verifies the adapter correctly maps cortex-core gateway runtime types
 * to @nous/shared projection types, producing fresh plain objects.
 */
import { describe, expect, it, vi } from 'vitest';
import type { IPrincipalSystemGatewayRuntime } from '@nous/cortex-core';
import { GatewayHealthSourceAdapter } from '../src/adapters/gateway-health-source-adapter.js';

const NOW = '2026-03-25T12:00:00.000Z';

function createMockRuntime(): IPrincipalSystemGatewayRuntime {
  return {
    getPrincipalGateway: vi.fn(),
    getSystemGateway: vi.fn(),
    getBootSnapshot: vi.fn().mockReturnValue({
      status: 'ready',
      completedSteps: ['subcortex_initialized', 'principal_booted', 'system_booted'],
      stepTimestamps: {
        subcortex_initialized: NOW,
        principal_booted: NOW,
        system_booted: NOW,
      },
      issueCodes: ['WARN_SLOW_BOOT'],
    }),
    getGatewayHealth: vi.fn().mockReturnValue({
      agentClass: 'Cortex::Principal',
      agentId: '00000000-0000-0000-0000-000000000001',
      visibleTools: ['tool-a', 'tool-b'],
      inboxReady: true,
      lastAckAt: NOW,
      lastObservationAt: NOW,
      lastSubmissionAt: undefined,
      lastSubmissionSource: undefined,
      lastResultStatus: 'completed',
      backlogAnalytics: {
        queuedCount: 2,
        activeCount: 1,
        suspendedCount: 0,
        completedInWindow: 10,
        failedInWindow: 1,
        pressureTrend: 'stable',
      },
      issueCodes: [],
      appSessions: [
        {
          sessionId: 'session-1',
          appId: 'app-1',
          packageId: 'pkg-1',
          projectId: '00000000-0000-0000-0000-000000000099',
          status: 'active',
          healthStatus: 'healthy',
          startedAt: NOW,
          lastHeartbeatAt: NOW,
          stale: false,
        },
      ],
    }),
    getSystemContextReplica: vi.fn().mockReturnValue({
      bootStatus: 'ready',
      inboxReady: true,
      lastSubmissionAt: NOW,
      lastSubmissionSource: 'scheduler',
      lastSystemResultStatus: 'completed',
      pendingSystemRuns: 3,
      backlogAnalytics: {
        queuedCount: 1,
        activeCount: 2,
        suspendedCount: 0,
        completedInWindow: 8,
        failedInWindow: 0,
        pressureTrend: 'increasing',
      },
      issueCodes: ['ISSUE_1'],
      visibleTools: ['sys-tool-a'],
      appSessions: [],
    }),
    listPrincipalTools: vi.fn(),
    listSystemTools: vi.fn(),
    submitTaskToSystem: vi.fn(),
    injectDirectiveToSystem: vi.fn(),
    submitIngressEnvelope: vi.fn(),
    notifyLeaseReleased: vi.fn(),
    whenIdle: vi.fn(),
  } as unknown as IPrincipalSystemGatewayRuntime;
}

describe('GatewayHealthSourceAdapter', () => {
  describe('getBootSnapshot()', () => {
    it('maps GatewayBootSnapshot to GatewayBootProjection (plain object)', () => {
      const runtime = createMockRuntime();
      const adapter = new GatewayHealthSourceAdapter(runtime);

      const result = adapter.getBootSnapshot();

      expect(result).toEqual({
        status: 'ready',
        completedSteps: ['subcortex_initialized', 'principal_booted', 'system_booted'],
        issueCodes: ['WARN_SLOW_BOOT'],
      });
      expect(runtime.getBootSnapshot).toHaveBeenCalledOnce();
    });

    it('drops stepTimestamps (cortex-core-only field)', () => {
      const runtime = createMockRuntime();
      const adapter = new GatewayHealthSourceAdapter(runtime);

      const result = adapter.getBootSnapshot();

      expect(result).not.toHaveProperty('stepTimestamps');
    });

    it('creates a fresh array for completedSteps (no pass-by-reference)', () => {
      const runtime = createMockRuntime();
      const adapter = new GatewayHealthSourceAdapter(runtime);

      const source = (runtime.getBootSnapshot as any)();
      const result = adapter.getBootSnapshot();

      expect(result.completedSteps).not.toBe(source.completedSteps);
      expect(result.completedSteps).toEqual(source.completedSteps);
    });
  });

  describe('getGatewayHealth(agentClass)', () => {
    it('maps GatewayHealthSnapshot to GatewayHealthProjection', () => {
      const runtime = createMockRuntime();
      const adapter = new GatewayHealthSourceAdapter(runtime);

      const result = adapter.getGatewayHealth('Cortex::Principal');

      expect(result.agentClass).toBe('Cortex::Principal');
      expect(result.agentId).toBe('00000000-0000-0000-0000-000000000001');
      expect(result.visibleTools).toEqual(['tool-a', 'tool-b']);
      expect(result.inboxReady).toBe(true);
      expect(result.lastAckAt).toBe(NOW);
      expect(result.lastResultStatus).toBe('completed');
      expect(result.backlogAnalytics.queuedCount).toBe(2);
      expect(result.appSessions).toHaveLength(1);
      expect(result.appSessions[0].sessionId).toBe('session-1');
      expect(runtime.getGatewayHealth).toHaveBeenCalledWith('Cortex::Principal');
    });

    it('drops lastSubmissionSource (cortex-core-only field)', () => {
      const runtime = createMockRuntime();
      const adapter = new GatewayHealthSourceAdapter(runtime);

      const result = adapter.getGatewayHealth('Cortex::Principal');

      expect(result).not.toHaveProperty('lastSubmissionSource');
    });

    it('creates fresh arrays (no pass-by-reference)', () => {
      const runtime = createMockRuntime();
      const adapter = new GatewayHealthSourceAdapter(runtime);

      const source = (runtime.getGatewayHealth as any)('Cortex::Principal');
      const result = adapter.getGatewayHealth('Cortex::Principal');

      expect(result.visibleTools).not.toBe(source.visibleTools);
      expect(result.issueCodes).not.toBe(source.issueCodes);
    });
  });

  describe('getSystemContextReplica()', () => {
    it('maps SystemContextReplica to SystemContextProjection', () => {
      const runtime = createMockRuntime();
      const adapter = new GatewayHealthSourceAdapter(runtime);

      const result = adapter.getSystemContextReplica();

      expect(result).toEqual({
        bootStatus: 'ready',
        inboxReady: true,
        pendingSystemRuns: 3,
        backlogAnalytics: {
          queuedCount: 1,
          activeCount: 2,
          suspendedCount: 0,
          completedInWindow: 8,
          failedInWindow: 0,
          pressureTrend: 'increasing',
        },
        issueCodes: ['ISSUE_1'],
      });
      expect(runtime.getSystemContextReplica).toHaveBeenCalledOnce();
    });

    it('drops lastSubmissionAt, lastSubmissionSource, lastSystemResultStatus, visibleTools, appSessions', () => {
      const runtime = createMockRuntime();
      const adapter = new GatewayHealthSourceAdapter(runtime);

      const result = adapter.getSystemContextReplica();

      expect(result).not.toHaveProperty('lastSubmissionAt');
      expect(result).not.toHaveProperty('lastSubmissionSource');
      expect(result).not.toHaveProperty('lastSystemResultStatus');
      expect(result).not.toHaveProperty('visibleTools');
      expect(result).not.toHaveProperty('appSessions');
    });

    it('creates a fresh issueCodes array (no pass-by-reference)', () => {
      const runtime = createMockRuntime();
      const adapter = new GatewayHealthSourceAdapter(runtime);

      const source = (runtime.getSystemContextReplica as any)();
      const result = adapter.getSystemContextReplica();

      expect(result.issueCodes).not.toBe(source.issueCodes);
      expect(result.issueCodes).toEqual(source.issueCodes);
    });
  });
});
