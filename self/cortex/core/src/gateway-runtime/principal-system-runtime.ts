import { randomUUID } from 'node:crypto';
import type {
  AgentClass,
  AgentGatewayConfig,
  GatewayBudget,
  GatewayOutboxEvent,
  IAgentGateway,
  IDocumentStore,
  IGatewayOutboxSink,
  IngressDispatchOutcome,
  IngressTriggerEnvelope,
  ToolDefinition,
} from '@nous/shared';
import { AgentGatewayFactory, createInboxFrame } from '../agent-gateway/index.js';
import {
  createInternalMcpSurfaceBundle,
  getInternalMcpCatalogEntry,
  getVisibleInternalMcpTools,
} from '../internal-mcp/index.js';
import { ORCHESTRATOR_SYSTEM_PROMPT } from '../prompts/index.js';
import { WorkmodeAdmissionGuard } from '../workmode/admission-guard.js';
import type { BacklogPriority, BacklogEntry } from './backlog-types.js';
import { SystemBacklogQueue } from './backlog-queue.js';
import { GatewayRuntimeHealthSink } from './runtime-health.js';
import { SystemContextReplicaProvider } from './system-context-replica.js';
import {
  createPrincipalCommunicationToolSurface,
  getPrincipalCommunicationToolDefinitions,
  type ISystemInboxSubmissionService,
} from './system-inbox-tools.js';
import type {
  GatewaySubmissionSource,
  IPrincipalSystemGatewayRuntime,
  PrincipalSystemGatewayRuntimeDeps,
  SystemDirectiveInjection,
  SystemSubmissionReceipt,
  SystemTaskSubmission,
} from './types.js';

const DEFAULT_TOP_LEVEL_BUDGET: GatewayBudget = {
  maxTurns: 4,
  maxTokens: 1200,
  timeoutMs: 120_000,
};

const DEFAULT_CHILD_BUDGET: GatewayBudget = {
  maxTurns: 3,
  maxTokens: 600,
  timeoutMs: 60_000,
};

const DEFAULT_PRINCIPAL_PROMPT = [
  'You are Cortex::Principal.',
  'You are a long-lived conversational gateway.',
  'You do not dispatch agents or complete workflow tasks.',
  'Use the System inbox communication tools when work must be delegated.',
].join('\n');

const DEFAULT_SYSTEM_PROMPT = [
  'You are Cortex::System.',
  'You are the long-lived coordination gateway for scheduler, event, and escalation owned work.',
  'Spawn downstream Orchestrator or Worker agents only through lifecycle tools.',
  'Use inbox context and delegated child execution to preserve canonical runtime truth.',
].join('\n');

const DEFAULT_WORKER_PROMPT = [
  'You are Worker.',
  'You execute assigned work and return through task_complete when finished.',
  'You cannot dispatch child agents.',
].join('\n');

class HealthTrackingOutboxSink implements IGatewayOutboxSink {
  constructor(
    private readonly agentClass: 'Cortex::Principal' | 'Cortex::System',
    private readonly healthSink: GatewayRuntimeHealthSink,
  ) {}

  async emit(event: GatewayOutboxEvent): Promise<void> {
    this.healthSink.recordGatewayEvent(this.agentClass, event);
  }
}

function mapSubmissionSource(
  triggerType: IngressTriggerEnvelope['trigger_type'],
): GatewaySubmissionSource {
  if (triggerType === 'scheduler') {
    return 'scheduler';
  }
  if (triggerType === 'system_event') {
    return 'system_event';
  }
  return 'hook';
}

function createInMemoryDocumentStore(): IDocumentStore {
  const rows = new Map<string, Map<string, unknown>>();
  return {
    async put<T>(collection: string, id: string, document: T): Promise<void> {
      const bucket = rows.get(collection) ?? new Map<string, unknown>();
      bucket.set(id, document);
      rows.set(collection, bucket);
    },
    async get<T>(collection: string, id: string): Promise<T | null> {
      return (rows.get(collection)?.get(id) as T | undefined) ?? null;
    },
    async query<T>(
      collection: string,
      filter: {
        where?: Record<string, unknown>;
        orderBy?: string;
        orderDirection?: 'asc' | 'desc';
      },
    ): Promise<T[]> {
      let values = Array.from(rows.get(collection)?.values() ?? []) as Array<Record<string, unknown>>;
      if (filter.where) {
        values = values.filter((value) =>
          Object.entries(filter.where ?? {}).every(([key, expected]) => value[key] === expected),
        );
      }
      if (filter.orderBy) {
        const direction = filter.orderDirection === 'desc' ? -1 : 1;
        values = [...values].sort((left, right) => {
          const leftValue = left[filter.orderBy!] as string | number | undefined;
          const rightValue = right[filter.orderBy!] as string | number | undefined;
          if (leftValue === rightValue) {
            return 0;
          }
          return leftValue! > rightValue! ? direction : -direction;
        });
      }
      return values as T[];
    },
    async delete(collection: string, id: string): Promise<boolean> {
      return rows.get(collection)?.delete(id) ?? false;
    },
  };
}

export class PrincipalSystemGatewayRuntime
implements IPrincipalSystemGatewayRuntime, ISystemInboxSubmissionService {
  private readonly healthSink = new GatewayRuntimeHealthSink();
  private readonly replicaProvider = new SystemContextReplicaProvider(this.healthSink);
  private readonly gatewayFactory: AgentGatewayFactory;
  private readonly workmodeAdmissionGuard: WorkmodeAdmissionGuard;
  private readonly idFactory: () => string;
  private readonly now: () => string;
  private readonly nowMs: () => number;
  private readonly principalGateway: IAgentGateway;
  private readonly systemGateway: IAgentGateway;
  private readonly principalTools: ToolDefinition[];
  private readonly systemTools: ToolDefinition[];
  private readonly systemBacklogQueue: SystemBacklogQueue;

  constructor(private readonly deps: PrincipalSystemGatewayRuntimeDeps = {}) {
    this.gatewayFactory = (deps.agentGatewayFactory ?? new AgentGatewayFactory()) as AgentGatewayFactory;
    this.workmodeAdmissionGuard =
      (deps.workmodeAdmissionGuard ?? new WorkmodeAdmissionGuard()) as WorkmodeAdmissionGuard;
    this.idFactory = deps.idFactory ?? randomUUID;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.nowMs = deps.nowMs ?? (() => Date.now());
    this.healthSink.completeBootStep('subcortex_initialized', this.now());
    this.healthSink.completeBootStep('internal_mcp_registered', this.now());

    const principalAgentId = this.nextGatewayId();
    const principalBase = createInternalMcpSurfaceBundle({
      agentClass: 'Cortex::Principal',
      agentId: principalAgentId as AgentGatewayConfig['agentId'],
      deps: this.createInternalMcpDeps(),
    });
    const principalToolSurface = createPrincipalCommunicationToolSurface({
      baseToolSurface: principalBase.toolSurface,
      submissionService: this,
      replicaReader: this.replicaProvider,
    });
    this.principalTools = [
      ...this.catalogDefinitions('Cortex::Principal'),
      ...getPrincipalCommunicationToolDefinitions(),
    ];
    this.principalGateway = this.gatewayFactory.create(
      this.createGatewayConfig({
        agentClass: 'Cortex::Principal',
        agentId: principalAgentId,
        toolSurface: principalToolSurface,
        lifecycleHooks: principalBase.lifecycleHooks,
        baseSystemPrompt:
          this.deps.principalBaseSystemPrompt ?? DEFAULT_PRINCIPAL_PROMPT,
        outbox: new HealthTrackingOutboxSink('Cortex::Principal', this.healthSink),
      }),
    );
    this.healthSink.markGatewayBooted({
      agentClass: 'Cortex::Principal',
      agentId: this.principalGateway.agentId,
      visibleTools: this.principalTools.map((tool) => tool.name),
      timestamp: this.now(),
    });

    const systemAgentId = this.nextGatewayId();
    const systemBundle = createInternalMcpSurfaceBundle({
      agentClass: 'Cortex::System',
      agentId: systemAgentId as AgentGatewayConfig['agentId'],
      deps: this.createInternalMcpDeps(),
    });
    this.systemTools = this.catalogDefinitions('Cortex::System');
    this.systemGateway = this.gatewayFactory.create(
      this.createGatewayConfig({
        agentClass: 'Cortex::System',
        agentId: systemAgentId,
        toolSurface: systemBundle.toolSurface,
        lifecycleHooks: systemBundle.lifecycleHooks,
        baseSystemPrompt: this.deps.systemBaseSystemPrompt ?? DEFAULT_SYSTEM_PROMPT,
        outbox: new HealthTrackingOutboxSink('Cortex::System', this.healthSink),
      }),
    );
    this.healthSink.markGatewayBooted({
      agentClass: 'Cortex::System',
      agentId: this.systemGateway.agentId,
      visibleTools: this.systemTools.map((tool) => tool.name),
      timestamp: this.now(),
    });

    void this.principalGateway.getInboxHandle().injectContext(
      createInboxFrame('Principal/System inbox exchange ready.', this.now),
    );
    void this.systemGateway.getInboxHandle().injectContext(
      createInboxFrame('Principal/System inbox exchange ready.', this.now),
    );
    this.healthSink.markInboxReady(this.now());
    this.systemBacklogQueue = new SystemBacklogQueue({
      documentStore: this.deps.documentStore ?? createInMemoryDocumentStore(),
      healthSink: this.healthSink,
      now: this.now,
      config: this.deps.backlogConfig,
      executeEntry: async (entry) => this.executeSystemEntry(entry),
    });
  }

  getPrincipalGateway(): IAgentGateway {
    return this.principalGateway;
  }

  getSystemGateway(): IAgentGateway {
    return this.systemGateway;
  }

  getBootSnapshot() {
    return this.healthSink.getBootSnapshot();
  }

  getGatewayHealth(agentClass: 'Cortex::Principal' | 'Cortex::System') {
    return this.healthSink.getGatewayHealth(agentClass);
  }

  getSystemContextReplica() {
    return this.replicaProvider.getReplica();
  }

  listPrincipalTools(): ToolDefinition[] {
    return this.principalTools.slice();
  }

  listSystemTools(): ToolDefinition[] {
    return this.systemTools.slice();
  }

  async submitTask(input: SystemTaskSubmission): Promise<SystemSubmissionReceipt> {
    return this.submitTaskToSystem(input);
  }

  async submitTaskToSystem(input: SystemTaskSubmission): Promise<SystemSubmissionReceipt> {
    return this.enqueueSystemSubmission({
      source: 'principal_tool',
      priority: 'high',
      instructions: input.task,
      payload: {
        detail: input.detail,
        submissionType: 'task',
      },
      projectId: input.projectId,
      inboxFrame: createInboxFrame(
        `Principal task queued for System: ${input.task}`,
        this.now,
      ),
    });
  }

  async injectDirective(input: SystemDirectiveInjection): Promise<SystemSubmissionReceipt> {
    return this.injectDirectiveToSystem(input);
  }

  async injectDirectiveToSystem(
    input: SystemDirectiveInjection,
  ): Promise<SystemSubmissionReceipt> {
    return this.enqueueSystemSubmission({
      source: 'principal_tool',
      priority: this.mapDirectivePriority(input.priority),
      instructions: input.directive,
      payload: {
        detail: input.detail,
        priority: input.priority,
        submissionType: 'directive',
      },
      projectId: input.projectId,
      inboxFrame: createInboxFrame(
        `Principal directive queued for System [${input.priority}]: ${input.directive}`,
        this.now,
      ),
    });
  }

  async submitIngressEnvelope(
    envelope: IngressTriggerEnvelope,
  ): Promise<IngressDispatchOutcome> {
    const receipt = await this.enqueueSystemSubmission({
      source: mapSubmissionSource(envelope.trigger_type),
      priority:
        envelope.trigger_type === 'scheduler'
          ? 'low'
          : envelope.trigger_type === 'system_event'
            ? 'normal'
            : 'normal',
      instructions: `Process ${envelope.trigger_type} event ${envelope.event_name}.`,
      payload: {
        envelope,
        submissionType: 'ingress',
      },
      projectId: envelope.project_id,
      inboxFrame: createInboxFrame(
        `Ingress accepted for System: ${envelope.trigger_type}:${envelope.event_name}`,
        this.now,
      ),
    });

    return {
      outcome: 'accepted_dispatched',
      run_id: receipt.runId as never,
      dispatch_ref: receipt.dispatchRef,
      workflow_ref: envelope.workflow_ref,
      policy_ref: `gateway-runtime:policy:${envelope.workmode_id}`,
      evidence_ref: `gateway-runtime:ingress:${envelope.trigger_id}`,
    };
  }

  async whenIdle(): Promise<void> {
    await this.systemBacklogQueue.whenIdle();
  }

  async notifyLeaseReleased(event: { laneKey: string; leaseId?: string }): Promise<void> {
    await this.systemBacklogQueue.notifyLeaseReleased(event);
  }

  private async enqueueSystemSubmission(args: {
    source: GatewaySubmissionSource;
    priority: BacklogPriority;
    instructions: string;
    payload: Record<string, unknown>;
    projectId?: string;
    inboxFrame: ReturnType<typeof createInboxFrame>;
  }): Promise<SystemSubmissionReceipt> {
    const acceptedAt = this.now();
    const runId = this.nextRunId();
    const dispatchRef = `gateway-runtime:dispatch:${runId}`;
    await this.systemBacklogQueue.enqueue({
      id: dispatchRef,
      runId,
      dispatchRef,
      source: args.source,
      priority: args.priority,
      instructions: args.instructions,
      payload: {
        ...args.payload,
        inboxFrame: args.inboxFrame,
      },
      projectId: args.projectId,
      acceptedAt,
    });

    return {
      runId,
      dispatchRef,
      acceptedAt,
      source: args.source,
    };
  }

  private async executeSystemEntry(entry: BacklogEntry) {
    const traceId = this.nextRunId();
    const inboxFrame = entry.payload.inboxFrame as ReturnType<typeof createInboxFrame> | undefined;
    if (inboxFrame) {
      await this.systemGateway.getInboxHandle().injectContext(inboxFrame);
    }

    const { inboxFrame: _ignored, ...payload } = entry.payload;
    const result = await this.systemGateway.run({
      taskInstructions: entry.instructions,
      payload,
      context: [],
      budget: DEFAULT_TOP_LEVEL_BUDGET,
      spawnBudgetCeiling: 12,
      correlation: {
        runId: entry.runId as never,
        parentId: this.systemGateway.agentId,
        sequence: 0,
      },
      execution: {
        projectId: entry.projectId as never,
        traceId: traceId as never,
        workmodeId: 'system:implementation',
      },
      modelRequirements: this.deps.defaultModelRequirements,
    });

    if (result.status === 'escalated') {
      await this.principalGateway.getInboxHandle().injectContext(
        createInboxFrame(
          `System escalation routed to Principal: ${result.reason}`,
          this.now,
        ),
      );
      this.healthSink.recordEscalationRoutedToPrincipal(this.now());
    }

    return result;
  }

  private createGatewayConfig(args: {
    agentClass: AgentClass;
    agentId: string;
    toolSurface: AgentGatewayConfig['toolSurface'];
    lifecycleHooks: AgentGatewayConfig['lifecycleHooks'];
    baseSystemPrompt: string;
    outbox?: IGatewayOutboxSink;
  }): AgentGatewayConfig {
    const provider = this.deps.modelProviderByClass?.[args.agentClass];
    return {
      agentClass: args.agentClass,
      agentId: args.agentId as AgentGatewayConfig['agentId'],
      toolSurface: args.toolSurface,
      lifecycleHooks: args.lifecycleHooks,
      outbox: args.outbox,
      baseSystemPrompt: args.baseSystemPrompt,
      defaultModelRequirements: this.deps.defaultModelRequirements,
      witnessService: this.deps.witnessService,
      modelProvider: provider,
      modelRouter: provider ? undefined : this.deps.modelRouter,
      getProvider: provider ? undefined : this.deps.getProvider,
      now: this.now,
      nowMs: this.nowMs,
      idFactory: this.idFactory,
    };
  }

  private createInternalMcpDeps() {
    return {
      getProjectApi: this.deps.getProjectApi,
      toolExecutor: this.deps.toolExecutor,
      pfc: this.deps.pfc,
      workflowEngine: this.deps.workflowEngine,
      projectStore: this.deps.projectStore,
      scheduler: this.deps.scheduler,
      escalationService: this.deps.escalationService,
      witnessService: this.deps.witnessService,
      outputSchemaValidator: this.deps.outputSchemaValidator,
      workmodeAdmissionGuard: this.workmodeAdmissionGuard,
      dispatchRuntime: {
        dispatchChild: async (dispatchArgs: {
          request: {
            targetClass: 'Orchestrator' | 'Worker';
            taskInstructions: string;
            payload?: unknown;
            nodeDefinitionId?: string;
          };
          context: {
            agentId: string;
            execution?: {
              projectId?: string;
              workmodeId?: string;
            };
          };
          budget: GatewayBudget;
        }) => {
          const child = this.createChildGateway(dispatchArgs.request.targetClass);
          const childRunId = this.nextRunId();
          const childTraceId = this.nextRunId();
          return child.run({
            taskInstructions: dispatchArgs.request.taskInstructions,
            payload: dispatchArgs.request.payload,
            context: [],
            budget: dispatchArgs.budget ?? DEFAULT_CHILD_BUDGET,
            spawnBudgetCeiling:
              dispatchArgs.request.targetClass === 'Orchestrator' ? 6 : 0,
            correlation: {
              runId: childRunId as never,
              parentId: dispatchArgs.context.agentId as never,
              sequence: 0,
            },
            execution: {
              projectId: dispatchArgs.context.execution?.projectId as never,
              traceId: childTraceId as never,
              workmodeId:
                dispatchArgs.context.execution?.workmodeId ?? 'system:implementation',
              nodeDefinitionId: dispatchArgs.request.nodeDefinitionId as never,
            },
            modelRequirements: this.deps.defaultModelRequirements,
          });
        },
        buildChildBudget: (request: {
          budget?: Partial<GatewayBudget>;
        }) => ({
          maxTurns: request.budget?.maxTurns ?? DEFAULT_CHILD_BUDGET.maxTurns,
          maxTokens: request.budget?.maxTokens ?? DEFAULT_CHILD_BUDGET.maxTokens,
          timeoutMs: request.budget?.timeoutMs ?? DEFAULT_CHILD_BUDGET.timeoutMs,
        }),
      },
      now: this.now,
      nowMs: this.nowMs,
      idFactory: this.idFactory,
    };
  }

  private createChildGateway(targetClass: 'Orchestrator' | 'Worker'): IAgentGateway {
    const childAgentId = this.nextGatewayId();
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: targetClass,
      agentId: childAgentId as AgentGatewayConfig['agentId'],
      deps: this.createInternalMcpDeps(),
    });

    return this.gatewayFactory.create(
      this.createGatewayConfig({
        agentClass: targetClass,
        agentId: childAgentId,
        toolSurface: bundle.toolSurface,
        lifecycleHooks: bundle.lifecycleHooks,
        baseSystemPrompt:
          targetClass === 'Orchestrator'
            ? this.deps.orchestratorBaseSystemPrompt ?? ORCHESTRATOR_SYSTEM_PROMPT
            : this.deps.workerBaseSystemPrompt ?? DEFAULT_WORKER_PROMPT,
      }),
    );
  }

  private catalogDefinitions(agentClass: AgentClass): ToolDefinition[] {
    return getVisibleInternalMcpTools(agentClass)
      .map((name) => getInternalMcpCatalogEntry(name)?.definition ?? null)
      .filter((definition): definition is ToolDefinition => definition !== null);
  }

  private nextGatewayId(): string {
    return this.idFactory();
  }

  private nextRunId(): string {
    return this.idFactory();
  }

  private mapDirectivePriority(
    priority: SystemDirectiveInjection['priority'],
  ): BacklogPriority {
    switch (priority) {
      case 'low':
        return 'low';
      case 'high':
        return 'high';
      case 'critical':
        return 'critical';
      default:
        return 'normal';
    }
  }
}

export function createPrincipalSystemGatewayRuntime(
  deps: PrincipalSystemGatewayRuntimeDeps = {},
): IPrincipalSystemGatewayRuntime {
  return new PrincipalSystemGatewayRuntime(deps);
}
