/**
 * HealthAggregator — Normalizes health data from multiple sources into typed snapshots.
 *
 * Implements IHealthAggregator. Accepts adapter interfaces (IGatewayHealthSource,
 * IProviderHealthSource) and IEventBus via constructor injection. All methods are
 * synchronous — data is read from in-memory caches and adapter direct reads.
 *
 * @nous/autonomic-health depends only on @nous/shared.
 */
import type {
  IHealthAggregator,
  IGatewayHealthSource,
  IProviderHealthSource,
  IEventBus,
  AppHealthChangePayload,
  AppHealthHeartbeatPayload,
  ProviderHealthSnapshot,
  AgentStatusSnapshot,
  SystemStatusSnapshot,
} from '@nous/shared';

export class HealthAggregator implements IHealthAggregator {
  private readonly gatewayHealthSource: IGatewayHealthSource;
  private readonly providerHealthSource: IProviderHealthSource;
  private readonly eventBus: IEventBus;

  private readonly cachedAppHealthChanges = new Map<string, AppHealthChangePayload>();
  private readonly cachedAppHeartbeats = new Map<string, AppHealthHeartbeatPayload>();
  private readonly subscriptionIds: string[] = [];

  constructor(deps: {
    gatewayHealthSource: IGatewayHealthSource;
    providerHealthSource: IProviderHealthSource;
    eventBus: IEventBus;
  }) {
    this.gatewayHealthSource = deps.gatewayHealthSource;
    this.providerHealthSource = deps.providerHealthSource;
    this.eventBus = deps.eventBus;

    // Subscribe to app health EventBus channels and cache latest payloads by sessionId
    const changeSubId = this.eventBus.subscribe('app-health:change', (payload) => {
      try {
        this.cachedAppHealthChanges.set(payload.sessionId, payload);
      } catch {
        // Preserve stale cache on handler error
        console.warn('[nous:health] Failed to cache app-health:change event');
      }
    });
    this.subscriptionIds.push(changeSubId);

    const heartbeatSubId = this.eventBus.subscribe('app-health:heartbeat', (payload) => {
      try {
        this.cachedAppHeartbeats.set(payload.sessionId, payload);
      } catch {
        // Preserve stale cache on handler error
        console.warn('[nous:health] Failed to cache app-health:heartbeat event');
      }
    });
    this.subscriptionIds.push(heartbeatSubId);
  }

  getProviderHealth(): ProviderHealthSnapshot {
    try {
      const providers = this.providerHealthSource.listProviders();
      return {
        providers: providers.map((p) => ({
          providerId: p.id,
          name: p.name,
          type: p.type,
          isLocal: p.isLocal,
          endpoint: p.endpoint,
          status: 'unknown' as const,
          modelId: p.modelId,
        })),
        collectedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.warn('[nous:health] Failed to read provider health from adapter', err);
      return {
        providers: [],
        collectedAt: new Date().toISOString(),
      };
    }
  }

  getAgentStatus(): AgentStatusSnapshot {
    try {
      const principalHealth = this.gatewayHealthSource.getGatewayHealth('Cortex::Principal');
      const systemHealth = this.gatewayHealthSource.getGatewayHealth('Cortex::System');

      const mapToGatewayEntry = (projection: typeof principalHealth) => ({
        agentClass: projection.agentClass,
        agentId: projection.agentId,
        inboxReady: projection.inboxReady,
        visibleToolCount: projection.visibleTools.length,
        lastAckAt: projection.lastAckAt,
        lastObservationAt: projection.lastObservationAt,
        lastSubmissionAt: projection.lastSubmissionAt,
        lastResultStatus: projection.lastResultStatus,
        issueCount: projection.issueCodes.length,
        issueCodes: projection.issueCodes,
      });

      return {
        gateways: [
          mapToGatewayEntry(principalHealth),
          mapToGatewayEntry(systemHealth),
        ],
        appSessions: systemHealth.appSessions.map((s) => ({
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
        // Escalation audit (Phase 1.2 — from system gateway health projection)
        escalationCount: systemHealth.escalationCount,
        lastEscalationAt: systemHealth.lastEscalationAt,
        lastEscalationSeverity: systemHealth.lastEscalationSeverity,
        collectedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.warn('[nous:health] Failed to read agent status from adapter', err);
      return {
        gateways: [],
        appSessions: [],
        collectedAt: new Date().toISOString(),
      };
    }
  }

  getSystemStatus(): SystemStatusSnapshot {
    try {
      const bootSnapshot = this.gatewayHealthSource.getBootSnapshot();
      const systemContext = this.gatewayHealthSource.getSystemContextReplica();

      return {
        bootStatus: bootSnapshot.status,
        completedBootSteps: bootSnapshot.completedSteps,
        issueCodes: [...bootSnapshot.issueCodes, ...systemContext.issueCodes],
        inboxReady: systemContext.inboxReady,
        pendingSystemRuns: systemContext.pendingSystemRuns,
        backlogAnalytics: {
          queuedCount: systemContext.backlogAnalytics.queuedCount,
          activeCount: systemContext.backlogAnalytics.activeCount,
          suspendedCount: systemContext.backlogAnalytics.suspendedCount,
          completedInWindow: systemContext.backlogAnalytics.completedInWindow,
          failedInWindow: systemContext.backlogAnalytics.failedInWindow,
          pressureTrend: systemContext.backlogAnalytics.pressureTrend,
        },
        // Escalation audit (Phase 1.2 — from systemContext)
        escalationCount: systemContext.escalationCount,
        lastEscalationAt: systemContext.lastEscalationAt,
        lastEscalationSeverity: systemContext.lastEscalationSeverity,
        // Checkpoint visibility (Phase 1.2 — from systemContext)
        lastPreparedCheckpointId: systemContext.lastPreparedCheckpointId,
        lastCommittedCheckpointId: systemContext.lastCommittedCheckpointId,
        chainValid: systemContext.chainValid,
        collectedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.warn('[nous:health] Failed to read system status from adapter', err);
      return {
        bootStatus: 'booting',
        completedBootSteps: [],
        issueCodes: [],
        inboxReady: false,
        pendingSystemRuns: 0,
        backlogAnalytics: {
          queuedCount: 0,
          activeCount: 0,
          suspendedCount: 0,
          completedInWindow: 0,
          failedInWindow: 0,
          pressureTrend: 'stable',
        },
        collectedAt: new Date().toISOString(),
      };
    }
  }

  dispose(): void {
    for (const id of this.subscriptionIds) {
      this.eventBus.unsubscribe(id);
    }
    this.subscriptionIds.length = 0;
  }
}
