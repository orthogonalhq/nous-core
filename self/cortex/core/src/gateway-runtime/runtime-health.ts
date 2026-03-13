import type {
  AgentResult,
  GatewayOutboxEvent,
} from '@nous/shared';
import {
  GatewayBootSnapshotSchema,
  GatewayHealthSnapshotSchema,
  SystemContextReplicaSchema,
  type GatewayBootSnapshot,
  type GatewayBootStatus,
  type GatewayBootStep,
  type GatewayHealthSnapshot,
  type GatewaySubmissionSource,
  type SystemContextReplica,
} from './types.js';

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
  issueCodes: string[];
}

export class GatewayRuntimeHealthSink {
  private readonly stepTimestamps = new Map<GatewayBootStep, string>();
  private readonly issueCodes = new Set<string>();
  private readonly gatewayHealth = new Map<TrackedAgentClass, MutableGatewayHealth>();
  private pendingSystemRuns = 0;

  constructor() {
    for (const agentClass of TRACKED_AGENT_CLASSES) {
      this.gatewayHealth.set(agentClass, {
        agentClass,
        agentId: '00000000-0000-0000-0000-000000000000',
        visibleTools: [],
        inboxReady: false,
        issueCodes: [],
      });
    }
  }

  completeBootStep(step: GatewayBootStep, timestamp: string): void {
    this.stepTimestamps.set(step, timestamp);
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
      return;
    }

    gateway.lastObservationAt = event.emittedAt;
  }

  recordSubmission(source: GatewaySubmissionSource, timestamp: string): void {
    const gateway = this.requireGateway('Cortex::System');
    gateway.lastSubmissionAt = timestamp;
    gateway.lastSubmissionSource = source;
    this.pendingSystemRuns += 1;
  }

  completeSubmission(result: AgentResult): void {
    const gateway = this.requireGateway('Cortex::System');
    gateway.lastResultStatus = result.status;
    this.pendingSystemRuns = Math.max(0, this.pendingSystemRuns - 1);

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
      issueCodes: [...gateway.issueCodes],
      visibleTools: [...gateway.visibleTools],
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
      issueCodes: [...new Set([...this.issueCodes, ...gateway.issueCodes])],
      visibleTools: [...gateway.visibleTools],
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
