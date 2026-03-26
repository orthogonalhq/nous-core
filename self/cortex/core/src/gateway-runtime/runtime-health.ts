import type {
  AgentResult,
  AppHealthSnapshot,
  AppRuntimeSession,
  GatewayOutboxEvent,
  IEventBus,
} from '@nous/shared';
import {
  GatewayAppSessionHealthProjectionSchema,
  GatewayBootSnapshotSchema,
  GatewayHealthSnapshotSchema,
  SystemContextReplicaSchema,
  type GatewayBootSnapshot,
  type GatewayBootStatus,
  type GatewayBootStep,
  type GatewayAppSessionHealthProjection,
  type GatewayHealthSnapshot,
  type GatewaySubmissionSource,
  type SystemContextReplica,
} from './types.js';
import {
  BacklogAnalyticsSchema,
  type BacklogAnalytics,
} from './backlog-types.js';

const TRACKED_AGENT_CLASSES = [
  'Cortex::Principal',
  'Cortex::System',
] as const;

type TrackedAgentClass = (typeof TRACKED_AGENT_CLASSES)[number];

interface MutableGatewayHealth {
  agentClass: TrackedAgentClass;
  agentId: string;
  visibleTools: string[];
  inboxReady: boolean;
  lastAckAt?: string;
  lastObservationAt?: string;
  lastSubmissionAt?: string;
  lastSubmissionSource?: GatewaySubmissionSource;
  lastResultStatus?: AgentResult['status'];
  backlogAnalytics: BacklogAnalytics;
  issueCodes: string[];
}

export class GatewayRuntimeHealthSink {
  private readonly stepTimestamps = new Map<GatewayBootStep, string>();
  private readonly issueCodes = new Set<string>();
  private readonly gatewayHealth = new Map<TrackedAgentClass, MutableGatewayHealth>();
  private readonly appSessions = new Map<string, GatewayAppSessionHealthProjection>();
  private pendingSystemRuns = 0;
  private readonly eventBus?: IEventBus;

  constructor(options?: { eventBus?: IEventBus }) {
    this.eventBus = options?.eventBus;
    const emptyAnalytics = BacklogAnalyticsSchema.parse({
      queuedCount: 0,
      activeCount: 0,
      suspendedCount: 0,
      activeCapacity: 1,
      windowStart: new Date(0).toISOString(),
      windowEnd: new Date(0).toISOString(),
      completedInWindow: 0,
      failedInWindow: 0,
      avgWaitMs: 0,
      avgExecutionMs: 0,
      p95WaitMs: 0,
      peakQueueDepth: 0,
      pressureTrend: 'stable',
    });

    for (const agentClass of TRACKED_AGENT_CLASSES) {
      this.gatewayHealth.set(agentClass, {
        agentClass,
        agentId: '00000000-0000-0000-0000-000000000000',
        visibleTools: [],
        inboxReady: false,
        backlogAnalytics: emptyAnalytics,
        issueCodes: [],
      });
    }
  }

  completeBootStep(step: GatewayBootStep, timestamp: string): void {
    this.stepTimestamps.set(step, timestamp);
    this.eventBus?.publish('health:boot-step', { step, status: 'completed' });
  }

  markGatewayBooted(args: {
    agentClass: TrackedAgentClass;
    agentId: string;
    visibleTools: string[];
    timestamp: string;
  }): void {
    const gateway = this.requireGateway(args.agentClass);
    gateway.agentId = args.agentId;
    gateway.visibleTools = args.visibleTools.slice();
    this.completeBootStep(
      args.agentClass === 'Cortex::Principal' ? 'principal_booted' : 'system_booted',
      args.timestamp,
    );
    this.eventBus?.publish('health:gateway-status', { status: 'booted' });
  }

  markInboxReady(timestamp: string): void {
    for (const agentClass of TRACKED_AGENT_CLASSES) {
      this.requireGateway(agentClass).inboxReady = true;
    }
    this.completeBootStep('inbox_exchange_ready', timestamp);
  }

  recordGatewayEvent(agentClass: TrackedAgentClass, event: GatewayOutboxEvent): void {
    const gateway = this.requireGateway(agentClass);
    if (event.type === 'turn_ack') {
      gateway.lastAckAt = event.emittedAt;
      this.eventBus?.publish('health:gateway-status', { status: 'booted' });
      return;
    }

    gateway.lastObservationAt = event.emittedAt;
  }

  recordSubmission(source: GatewaySubmissionSource, timestamp: string): void {
    const gateway = this.requireGateway('Cortex::System');
    gateway.lastSubmissionAt = timestamp;
    gateway.lastSubmissionSource = source;
  }

  completeSubmission(result: Pick<AgentResult, 'status'>): void {
    const gateway = this.requireGateway('Cortex::System');
    gateway.lastResultStatus = result.status;

    if (result.status === 'error') {
      this.addIssue('system_runtime_error');
      return;
    }

    if (result.status === 'budget_exhausted') {
      this.addIssue('system_runtime_budget_exhausted');
    }
  }

  recordEscalationRoutedToPrincipal(timestamp: string): void {
    const gateway = this.requireGateway('Cortex::Principal');
    gateway.lastSubmissionAt = timestamp;
    gateway.lastSubmissionSource = 'principal_tool';
  }

  addIssue(code: string, agentClass?: TrackedAgentClass): void {
    this.issueCodes.add(code);
    if (agentClass) {
      const gateway = this.requireGateway(agentClass);
      if (!gateway.issueCodes.includes(code)) {
        gateway.issueCodes.push(code);
      }
    }
    this.eventBus?.publish('health:issue', { issueId: code, severity: 'warning', message: code });
  }

  updateBacklogAnalytics(analytics: BacklogAnalytics): void {
    const gateway = this.requireGateway('Cortex::System');
    gateway.backlogAnalytics = BacklogAnalyticsSchema.parse(analytics);
    this.pendingSystemRuns =
      analytics.queuedCount + analytics.activeCount + analytics.suspendedCount;
    this.eventBus?.publish('health:backlog-analytics', {
      pending: analytics.queuedCount,
      inProgress: analytics.activeCount,
      completed: analytics.completedInWindow,
    });
  }

  upsertAppSession(
    session: Pick<
      AppRuntimeSession,
      | 'session_id'
      | 'app_id'
      | 'package_id'
      | 'project_id'
      | 'status'
      | 'health_status'
      | 'started_at'
      | 'last_heartbeat_at'
    >,
  ): GatewayAppSessionHealthProjection {
    const current = this.appSessions.get(session.session_id);
    const projection = GatewayAppSessionHealthProjectionSchema.parse({
      sessionId: session.session_id,
      appId: session.app_id,
      packageId: session.package_id,
      projectId: session.project_id,
      status: session.status,
      healthStatus: session.health_status,
      startedAt: session.started_at,
      lastHeartbeatAt: session.last_heartbeat_at,
      stale:
        current?.stale ??
        session.health_status === 'stale',
    });
    this.appSessions.set(projection.sessionId, projection);
    this.eventBus?.publish('app-health:change', {
      appId: session.app_id,
      sessionId: session.session_id,
      status: session.health_status as 'healthy' | 'degraded' | 'stale' | 'disconnected',
    });
    return projection;
  }

  recordAppHealth(snapshot: Pick<AppHealthSnapshot, 'session_id' | 'status' | 'reported_at' | 'stale'>): GatewayAppSessionHealthProjection | null {
    const current = this.appSessions.get(snapshot.session_id);
    if (!current) {
      return null;
    }

    const projection = GatewayAppSessionHealthProjectionSchema.parse({
      ...current,
      healthStatus: snapshot.status,
      lastHeartbeatAt: snapshot.reported_at,
      stale: snapshot.stale,
    });
    this.appSessions.set(projection.sessionId, projection);
    this.eventBus?.publish('app-health:change', {
      appId: current.appId,
      sessionId: snapshot.session_id,
      status: snapshot.status as 'healthy' | 'degraded' | 'stale' | 'disconnected',
    });
    return projection;
  }

  removeAppSession(sessionId: string): void {
    this.appSessions.delete(sessionId);
  }

  getBootSnapshot(): GatewayBootSnapshot {
    return GatewayBootSnapshotSchema.parse({
      status: this.resolveBootStatus(),
      completedSteps: Array.from(this.stepTimestamps.keys()),
      stepTimestamps: Object.fromEntries(this.stepTimestamps.entries()),
      issueCodes: Array.from(this.issueCodes),
    });
  }

  getGatewayHealth(agentClass: TrackedAgentClass): GatewayHealthSnapshot {
    const gateway = this.requireGateway(agentClass);
    return GatewayHealthSnapshotSchema.parse({
      ...gateway,
      backlogAnalytics: gateway.backlogAnalytics,
      issueCodes: [...gateway.issueCodes],
      visibleTools: [...gateway.visibleTools],
      appSessions:
        agentClass === 'Cortex::System'
          ? [...this.appSessions.values()]
          : [],
    });
  }

  getSystemContextReplica(): SystemContextReplica {
    const gateway = this.requireGateway('Cortex::System');
    return SystemContextReplicaSchema.parse({
      bootStatus: this.resolveBootStatus(),
      inboxReady: gateway.inboxReady,
      lastSubmissionAt: gateway.lastSubmissionAt,
      lastSubmissionSource: gateway.lastSubmissionSource,
      lastSystemResultStatus: gateway.lastResultStatus,
      pendingSystemRuns: this.pendingSystemRuns,
      backlogAnalytics: gateway.backlogAnalytics,
      issueCodes: [...new Set([...this.issueCodes, ...gateway.issueCodes])],
      visibleTools: [...gateway.visibleTools],
      appSessions: [...this.appSessions.values()],
    });
  }

  private resolveBootStatus(): GatewayBootStatus {
    if (this.issueCodes.size > 0) {
      return 'degraded';
    }

    return this.stepTimestamps.size === 5 ? 'ready' : 'booting';
  }

  private requireGateway(agentClass: TrackedAgentClass): MutableGatewayHealth {
    const gateway = this.gatewayHealth.get(agentClass);
    if (!gateway) {
      throw new Error(`Gateway health missing for ${agentClass}`);
    }
    return gateway;
  }
}
