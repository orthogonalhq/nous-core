import { randomUUID } from 'node:crypto';
import type {
  AgentClass,
  AgentGatewayConfig,
  GatewayBudget,
  GatewayOutboxEvent,
  IAgentGateway,
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
  private systemQueue: Promise<void> = Promise.resolve();

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
    await this.systemQueue;
  }

  private async enqueueSystemSubmission(args: {
    source: GatewaySubmissionSource;
    instructions: string;
    payload: Record<string, unknown>;
    projectId?: string;
    inboxFrame: ReturnType<typeof createInboxFrame>;
  }): Promise<SystemSubmissionReceipt> {
    const acceptedAt = this.now();
    const runId = this.nextRunId();
    const dispatchRef = `gateway-runtime:dispatch:${runId}`;
    this.healthSink.recordSubmission(args.source, acceptedAt);
    await this.systemGateway.getInboxHandle().injectContext(args.inboxFrame);

    const queued = this.systemQueue.then(async () => {
      const traceId = this.nextRunId();
      const result = await this.systemGateway.run({
        taskInstructions: args.instructions,
        payload: args.payload,
        context: [],
        budget: DEFAULT_TOP_LEVEL_BUDGET,
        spawnBudgetCeiling: 12,
        correlation: {
          runId: runId as never,
          parentId: this.systemGateway.agentId,
          sequence: 0,
        },
        execution: {
          projectId: args.projectId as never,
          traceId: traceId as never,
          workmodeId: 'system:implementation',
        },
        modelRequirements: this.deps.defaultModelRequirements,
      });

      this.healthSink.completeSubmission(result);
      if (result.status === 'escalated') {
        await this.principalGateway.getInboxHandle().injectContext(
          createInboxFrame(
            `System escalation routed to Principal: ${result.reason}`,
            this.now,
          ),
        );
        this.healthSink.recordEscalationRoutedToPrincipal(this.now());
      }
    });

    this.systemQueue = queued.catch(() => {
      this.healthSink.addIssue('system_submission_queue_failed', 'Cortex::System');
    });

    return {
      runId,
      dispatchRef,
      acceptedAt,
      source: args.source,
    };
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
}

export function createPrincipalSystemGatewayRuntime(
  deps: PrincipalSystemGatewayRuntimeDeps = {},
): IPrincipalSystemGatewayRuntime {
  return new PrincipalSystemGatewayRuntime(deps);
}
