/**
 * GatewayHealthSourceAdapter — Maps cortex-core gateway runtime types to
 * @nous/shared health projection types.
 *
 * Implements IGatewayHealthSource by wrapping IPrincipalSystemGatewayRuntime.
 * All mappings produce fresh plain objects to avoid zod v3/v4 brand mismatch.
 *
 * Lives in the server bootstrap layer (NOT in @nous/autonomic-health) to
 * preserve the dependency direction invariant:
 *   autonomic/ -> depends on interfaces in shared/
 *   autonomic/ -> never touches cortex/
 */
import type {
  IGatewayHealthSource,
  GatewayBootProjection,
  GatewayHealthProjection,
  SystemContextProjection,
} from '@nous/shared';
import type { IPrincipalSystemGatewayRuntime } from '@nous/cortex-core';

export class GatewayHealthSourceAdapter implements IGatewayHealthSource {
  private readonly runtime: IPrincipalSystemGatewayRuntime;

  constructor(runtime: IPrincipalSystemGatewayRuntime) {
    this.runtime = runtime;
  }

  getBootSnapshot(): GatewayBootProjection {
    const source = this.runtime.getBootSnapshot();
    return {
      status: source.status,
      completedSteps: [...source.completedSteps],
      issueCodes: [...source.issueCodes],
    };
  }

  getGatewayHealth(agentClass: string): GatewayHealthProjection {
    const source = this.runtime.getGatewayHealth(
      agentClass as 'Cortex::Principal' | 'Cortex::System',
    );
    return {
      agentClass: source.agentClass,
      agentId: source.agentId,
      visibleTools: [...source.visibleTools],
      inboxReady: source.inboxReady,
      lastAckAt: source.lastAckAt,
      lastObservationAt: source.lastObservationAt,
      lastSubmissionAt: source.lastSubmissionAt,
      lastResultStatus: source.lastResultStatus,
      backlogAnalytics: {
        queuedCount: source.backlogAnalytics.queuedCount,
        activeCount: source.backlogAnalytics.activeCount,
        suspendedCount: source.backlogAnalytics.suspendedCount,
        completedInWindow: source.backlogAnalytics.completedInWindow,
        failedInWindow: source.backlogAnalytics.failedInWindow,
        pressureTrend: source.backlogAnalytics.pressureTrend,
      },
      issueCodes: [...source.issueCodes],
      appSessions: source.appSessions.map((s: (typeof source.appSessions)[number]) => ({
        sessionId: s.sessionId,
        appId: s.appId,
        packageId: s.packageId,
        projectId: s.projectId,
        status: s.status,
        healthStatus: s.healthStatus,
        startedAt: s.startedAt,
        lastHeartbeatAt: s.lastHeartbeatAt,
        stale: s.stale,
      })),
    };
  }

  getSystemContextReplica(): SystemContextProjection {
    const source = this.runtime.getSystemContextReplica();
    return {
      bootStatus: source.bootStatus,
      inboxReady: source.inboxReady,
      pendingSystemRuns: source.pendingSystemRuns,
      backlogAnalytics: {
        queuedCount: source.backlogAnalytics.queuedCount,
        activeCount: source.backlogAnalytics.activeCount,
        suspendedCount: source.backlogAnalytics.suspendedCount,
        completedInWindow: source.backlogAnalytics.completedInWindow,
        failedInWindow: source.backlogAnalytics.failedInWindow,
        pressureTrend: source.backlogAnalytics.pressureTrend,
      },
      issueCodes: [...source.issueCodes],
    };
  }
}
