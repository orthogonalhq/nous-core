/**
 * CortexRuntime — the execution kernel for the Nous cortex layer.
 *
 * Owns boot, lifecycle, Principal-System communication, health tracking,
 * recovery/checkpoint orchestration, backlog queue, and dispatch.
 *
 * Renamed from PrincipalSystemGatewayRuntime in SP 1.3 (WR-127).
 * Gateway construction delegated to the provider's adapter pattern —
 * the wrapProviderWithInputTransform and synthesizeTaskComplete hacks
 * are eliminated.
 */
import { createHash, randomUUID } from 'node:crypto';
import type {
  AgentClass,
  AgentGatewayConfig,
  AgentResult,
  GatewayBudget,
  GatewayContextFrame,
  GatewayOutboxEvent,
  IAgentGateway,
  ICheckpointManager,
  IDocumentStore,
  IEventBus,
  IGatewayOutboxSink,
  IRecoveryLedgerStore,
  IRecoveryOrchestrator,
  IRetryPolicyEvaluator,
  IRollbackPolicyEvaluator,
  IngressDispatchOutcome,
  IngressTriggerEnvelope,
  ProjectId,
  RecoveryOrchestratorContext,
  StmContext,
  ToolDefinition,
  TraceEvidenceReference,
  TraceId,
  HarnessStrategies,
  ILogChannel,
  PromptFormatterInput,
  ProviderVendor,
} from '@nous/shared';
import { GatewayContextFrameSchema } from '@nous/shared';
import { AgentGatewayFactory, createInboxFrame } from '../agent-gateway/index.js';
import {
  createInternalMcpSurfaceBundle,
  getInternalMcpCatalogEntry,
  getVisibleInternalMcpTools,
} from '../internal-mcp/index.js';
import { detectAndStripNarration } from '../output-parser.js';
import { CARD_PROMPT_FRAGMENT } from './card-prompt-fragment.js';
import { WORKFLOW_PROMPT_FRAGMENT } from './workflow-prompt-fragment.js';
import { getOrchestratorPrompt } from '../prompts/index.js';
import { resolvePromptConfig, composeSystemPromptFromConfig, resolveAgentProfile } from './prompt-strategy.js';
import { resolveAdapter } from '../agent-gateway/adapters/index.js';
import { composeFromProfile } from './prompt-composer.js';
import { resolveContextBudget } from './context-budget-resolver.js';
import { RetryPolicyEvaluator } from '../recovery/retry-policy-evaluator.js';
import { RollbackPolicyEvaluator } from '../recovery/rollback-policy-evaluator.js';
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
import {
  createDevNotificationToolSurface,
  getDevNotificationToolDefinitions,
} from './dev-notification-tools.js';
import type {
  ChatTurnInput,
  ChatTurnResult,
  CheckpointVisibilityStatus,
  EscalationAuditSummary,
  GatewaySubmissionSource,
  IPrincipalSystemGatewayRuntime,
  PrincipalSystemGatewayRuntimeDeps,
  SystemDirectiveInjection,
  SystemSubmissionReceipt,
  SystemTaskSubmission,
} from './types.js';
import { ChatTurnInputSchema } from './types.js';

const DEFAULT_TOP_LEVEL_BUDGET: GatewayBudget = {
  maxTurns: 4,
  maxTokens: 1200,
  timeoutMs: 120_000,
};

const DEFAULT_CHAT_TURN_BUDGET: GatewayBudget = {
  maxTurns: 8,
  maxTokens: 65_536,
  timeoutMs: 120_000,
};

const DEFAULT_CHILD_BUDGET: GatewayBudget = {
  maxTurns: 3,
  maxTokens: 600,
  timeoutMs: 60_000,
};

class HealthTrackingOutboxSink implements IGatewayOutboxSink {
  constructor(
    private readonly agentClass: 'Cortex::Principal' | 'Cortex::System',
    private readonly healthSink: GatewayRuntimeHealthSink,
    private readonly eventBus?: IEventBus,
  ) {}

  async emit(event: GatewayOutboxEvent): Promise<void> {
    this.healthSink.recordGatewayEvent(this.agentClass, event);

    if (this.eventBus) {
      try {
        if (event.type === 'turn_ack') {
          this.eventBus.publish('system:turn-ack', {
            agentClass: this.agentClass,
            turn: event.turn,
            runId: event.correlation.runId,
            turnsUsed: event.usage.turnsUsed,
            tokensUsed: event.usage.tokensUsed,
            emittedAt: event.emittedAt,
          });
        } else if (event.type === 'observation') {
          this.eventBus.publish('system:outbox-event', {
            agentClass: this.agentClass,
            type: 'observation',
            observationType: event.observation.observationType,
            content: event.observation.content,
            runId: event.correlation.runId,
            emittedAt: event.emittedAt,
          });
        }
      } catch {
        // Event bus publication is fire-and-forget; do not disrupt health sink recording
      }
    }
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

/**
 * CortexRuntime — cortex layer execution kernel.
 *
 * Previously named PrincipalSystemGatewayRuntime. Renamed in SP 1.3 to
 * reflect its actual role as the cortex engine (Mind Model Layer 1).
 */
export class CortexRuntime
implements IPrincipalSystemGatewayRuntime, ISystemInboxSubmissionService {
  private readonly healthSink: GatewayRuntimeHealthSink;
  private readonly replicaProvider: SystemContextReplicaProvider;
  private readonly gatewayFactory: AgentGatewayFactory;
  private readonly workmodeAdmissionGuard: WorkmodeAdmissionGuard;
  private readonly idFactory: () => string;
  private readonly now: () => string;
  private readonly nowMs: () => number;
  private readonly principalGateway: IAgentGateway;
  private readonly systemGateway: IAgentGateway;
  // WR-138 row #6 / Finding IP-5: keep references to the gateway configs so
  // attachProviders() can swap the `harness` field in place without rebuilding
  // the gateway instances. The gateways hold the config by reference via
  // `AgentGatewayFactory.create()`, so mutating the field on these captured
  // references propagates to the running gateways on their next `run(...)`.
  private principalGatewayConfig!: AgentGatewayConfig;
  private systemGatewayConfig!: AgentGatewayConfig;
  // WR-138 row #6 / CPAL § 4: state for attachProviders idempotency and the
  // first-use startup warning per Finding IP-6.
  private attachedVendorByClass:
    | Partial<Record<AgentClass, ProviderVendor>>
    | null = null;
  private attachWarningEmitted = false;
  // WR-148 phase 1.1: turn-in-progress guard for runtime harness recomposition.
  // Simple boolean flag per agent class — the gateway run loop is sequential per
  // instance, so no concurrency primitive is needed.
  private turnInProgressByClass: Map<string, boolean> = new Map();
  private pendingRecompose: Map<string, ProviderVendor> = new Map();
  private readonly principalTools: ToolDefinition[];
  private readonly systemTools: ToolDefinition[];
  private readonly systemBacklogQueue: SystemBacklogQueue;

  // Recovery component slots (Phase 1.2 — WR-072)
  private readonly checkpointManager?: ICheckpointManager;
  private readonly recoveryLedgerStore?: IRecoveryLedgerStore;
  private readonly recoveryOrchestrator?: IRecoveryOrchestrator;
  private readonly retryPolicyEvaluator: IRetryPolicyEvaluator;
  private readonly rollbackPolicyEvaluator: IRollbackPolicyEvaluator;
  private readonly log: ILogChannel;

  constructor(private readonly deps: PrincipalSystemGatewayRuntimeDeps = {}) {
    this.healthSink = new GatewayRuntimeHealthSink({ eventBus: deps.eventBus, notificationService: deps.notificationService });
    this.replicaProvider = new SystemContextReplicaProvider(this.healthSink);
    this.gatewayFactory = (deps.agentGatewayFactory ?? new AgentGatewayFactory()) as AgentGatewayFactory;
    this.workmodeAdmissionGuard =
      (deps.workmodeAdmissionGuard ?? new WorkmodeAdmissionGuard()) as WorkmodeAdmissionGuard;
    this.idFactory = deps.idFactory ?? randomUUID;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.nowMs = deps.nowMs ?? (() => Date.now());

    // Recovery component wiring (Phase 1.2 — WR-072)
    this.checkpointManager = deps.checkpointManager;
    this.recoveryLedgerStore = deps.recoveryLedgerStore;
    this.recoveryOrchestrator = deps.recoveryOrchestrator;
    this.retryPolicyEvaluator = new RetryPolicyEvaluator();
    this.rollbackPolicyEvaluator = new RollbackPolicyEvaluator();
    this.log = deps.logger?.channel('nous:cortex-runtime') ?? { debug() {}, info() {}, warn() {}, error() {}, isEnabled() { return false; } };

    this.healthSink.completeBootStep('subcortex_initialized', this.now());
    this.healthSink.completeBootStep('internal_mcp_registered', this.now());

    const principalAgentId = this.nextGatewayId();
    const principalBase = createInternalMcpSurfaceBundle({
      agentClass: 'Cortex::Principal',
      agentId: principalAgentId as AgentGatewayConfig['agentId'],
      deps: this.createInternalMcpDeps(),
    });
    let principalToolSurface = createPrincipalCommunicationToolSurface({
      baseToolSurface: principalBase.toolSurface,
      submissionService: this,
      replicaReader: this.replicaProvider,
    });
    // WR-151 SP 1.4: Chain dev notification tools when not in production.
    // The factory is never called in production, so the tools are absent
    // from listTools() entirely.
    const devToolDefinitions =
      process.env.NODE_ENV !== 'production' && this.deps.notificationStore
        ? getDevNotificationToolDefinitions()
        : [];
    if (
      process.env.NODE_ENV !== 'production' &&
      this.deps.notificationService &&
      this.deps.notificationStore
    ) {
      principalToolSurface = createDevNotificationToolSurface({
        baseToolSurface: principalToolSurface,
        notificationService: this.deps.notificationService,
        notificationStore: this.deps.notificationStore,
      });
    }
    this.principalTools = [
      ...this.catalogDefinitions('Cortex::Principal'),
      ...getPrincipalCommunicationToolDefinitions(),
      ...devToolDefinitions,
    ];
    // WR-138 row #6: capture config before handing it to the factory so
    // attachProviders() can recompose in place.
    this.principalGatewayConfig = this.createGatewayConfig({
      agentClass: 'Cortex::Principal',
      agentId: principalAgentId,
      toolSurface: principalToolSurface,
      lifecycleHooks: principalBase.lifecycleHooks,
      baseSystemPrompt:
        this.deps.principalBaseSystemPrompt
          ?? composeSystemPromptFromConfig(resolvePromptConfig('Cortex::Principal')),
      outbox: new HealthTrackingOutboxSink('Cortex::Principal', this.healthSink, this.deps.eventBus),
    });
    this.principalGateway = this.gatewayFactory.create(this.principalGatewayConfig);
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
    // WR-138 row #6: capture config before handing it to the factory so
    // attachProviders() can recompose in place.
    this.systemGatewayConfig = this.createGatewayConfig({
      agentClass: 'Cortex::System',
      agentId: systemAgentId,
      toolSurface: systemBundle.toolSurface,
      lifecycleHooks: systemBundle.lifecycleHooks,
      baseSystemPrompt: this.deps.systemBaseSystemPrompt
        ?? composeSystemPromptFromConfig(resolvePromptConfig('Cortex::System'), this.systemTools),
      outbox: new HealthTrackingOutboxSink('Cortex::System', this.healthSink, this.deps.eventBus),
    });
    this.systemGateway = this.gatewayFactory.create(this.systemGatewayConfig);
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
    if (!this.deps.documentStore) {
      this.log.warn('Using in-memory document store for backlog queue -- queued work will not survive restart');
    }
    this.systemBacklogQueue = new SystemBacklogQueue({
      documentStore: this.deps.documentStore ?? createInMemoryDocumentStore(),
      healthSink: this.healthSink,
      now: this.now,
      config: this.deps.backlogConfig,
      executeEntry: async (entry) => this.executeSystemEntry(entry),
      log: this.deps.logger?.channel('nous:backlog-queue'),
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

  getCheckpointStatus(): CheckpointVisibilityStatus {
    return this.healthSink.getCheckpointStatus();
  }

  getEscalationAuditSummary(): EscalationAuditSummary {
    return this.healthSink.getEscalationAuditSummary();
  }

  listPrincipalTools(): ToolDefinition[] {
    return this.principalTools.slice();
  }

  listSystemTools(): ToolDefinition[] {
    return this.systemTools.slice();
  }

  async submitTask(input: SystemTaskSubmission): Promise<SystemSubmissionReceipt> {
    this.checkAttachOrWarn();
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
    this.checkAttachOrWarn();
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
      workflow_ref: envelope.workflow_ref ?? envelope.task_ref ?? '',
      policy_ref: `gateway-runtime:policy:${envelope.workmode_id}`,
      evidence_ref: `gateway-runtime:ingress:${envelope.trigger_id}`,
    };
  }

  async handleChatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
    this.checkAttachOrWarn();
    const parsed = ChatTurnInputSchema.parse(input);
    const { message, projectId, traceId } = parsed;

    // Opctl gate check
    if (projectId && this.deps.opctlService) {
      try {
        const controlState = await this.deps.opctlService.getProjectControlState(
          projectId as ProjectId,
        );
        if (controlState === 'paused_review' || controlState === 'hard_stopped') {
          return {
            response: `[Project blocked by operator control (${controlState}).]`,
            traceId,
          };
        }
      } catch {
        // Fail-open: opctl service error should not block chat
        this.log.warn('handleChatTurn: opctl gate check failed, allowing execution');
      }
    }

    // Load STM context
    let contextFrames: GatewayContextFrame[] = [];
    if (projectId && this.deps.stmStore) {
      try {
        const stmContext = await this.deps.stmStore.getContext(projectId as ProjectId);
        contextFrames = this.buildChatContextFrames(stmContext);
      } catch {
        this.log.warn('handleChatTurn: STM context load failed, proceeding without history');
      }
    } else if (projectId && !this.deps.stmStore) {
      this.log.warn('handleChatTurn: stmStore not available, proceeding without conversation history');
    }

    // Add the user message as a plain-text user frame, not as a JSON payload.
    // The payload field stringifies objects, causing the model to see
    // '{"message":"..."}' instead of the natural user message.
    const chatContext: GatewayContextFrame[] = [
      ...contextFrames,
      {
        role: 'user' as const,
        source: 'runtime' as const,
        content: message,
        createdAt: this.now(),
      },
    ];

    // Run Principal gateway (with turn-in-progress guard for recompose safety)
    this.turnInProgressByClass.set('Cortex::Principal', true);
    let result;
    try {
      result = await this.principalGateway.run({
        taskInstructions: `Handle the current user chat turn. Respond conversationally.\n\n${WORKFLOW_PROMPT_FRAGMENT}\n\n${CARD_PROMPT_FRAGMENT}`,
        context: chatContext,
        budget: DEFAULT_CHAT_TURN_BUDGET,
        spawnBudgetCeiling: 0,
        correlation: {
          runId: this.nextRunId() as never,
          parentId: this.principalGateway.agentId,
          sequence: 0,
        },
        execution: {
          projectId: projectId as never,
          traceId: traceId as never,
          workmodeId: 'system:implementation',
        },
        modelRequirements: this.deps.defaultModelRequirements,
      });
    } finally {
      this.turnInProgressByClass.set('Cortex::Principal', false);
      this.checkPendingRecompose('Cortex::Principal');
    }

    // Resolve response
    const resolved = this.resolveChatResponse(result);

    // Normalize — strip chain-of-thought narration if detected
    const normalized = detectAndStripNarration(resolved.response);
    if (normalized.wasNarrated) {
      this.log.debug('handleChatTurn: narration detected and stripped');
    }
    const responseText = normalized.cleaned;

    // Finalize STM
    await this.finalizeChatStmTurn(
      projectId,
      message,
      responseText,
      traceId,
      result.evidenceRefs,
      resolved.contentType,
    );

    return {
      response: responseText,
      traceId,
      contentType: resolved.contentType,
      thinkingContent: resolved.thinkingContent,
    };
  }

  async whenIdle(): Promise<void> {
    await this.systemBacklogQueue.whenIdle();
  }

  async listBacklogEntries(filter?: { status?: import('./backlog-types.js').BacklogEntryStatus }): Promise<BacklogEntry[]> {
    return this.systemBacklogQueue.listEntries(filter);
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

  /** Build a synthetic AgentResult for pre-execution gate blocks or recovery terminal states. */
  private buildSyntheticResult(
    entry: BacklogEntry,
    status: 'suspended' | 'escalated' | 'error',
    reason: string,
  ): AgentResult {
    return {
      status,
      reason,
      correlation: {
        runId: entry.runId as never,
        parentId: this.systemGateway.agentId,
        sequence: 0,
      },
      usage: { turnsUsed: 0, tokensUsed: 0, elapsedMs: 0, spawnUnitsUsed: 0 },
      evidenceRefs: [],
      ...(status === 'suspended' ? { resumeWhen: 'lease_release' as const } : {}),
      ...(status === 'escalated' ? { severity: 'high' as never, detail: {} } : {}),
      ...(status === 'error' ? { detail: {} } : {}),
    } as unknown as AgentResult;
  }

  private async executeSystemEntry(entry: BacklogEntry): Promise<AgentResult> {
    // Phase 1.2 — Opctl gate: block principal_tool-sourced entries when project is paused/stopped
    if (entry.source === 'principal_tool' && entry.projectId && this.deps.opctlService) {
      try {
        const controlState = await this.deps.opctlService.getProjectControlState(
          entry.projectId as never,
        );
        if (controlState === 'paused_review' || controlState === 'hard_stopped') {
          this.healthSink.addIssue('opctl_gate_blocked', 'Cortex::System');
          return this.buildSyntheticResult(entry, 'error', `opctl_gate_blocked:${controlState}`);
        }
      } catch {
        // Fail-open: opctl service error should not block execution
        this.log.warn('opctl gate check failed, allowing execution');
      }
    }
    // scheduler, system_event, hook sources bypass the gate entirely

    // Phase 1.2 — Checkpoint capture: prepare before execution
    let preparedCheckpointId: string | undefined;
    if (this.checkpointManager && entry.projectId) {
      try {
        const stateHash = createHash('sha256')
          .update(JSON.stringify(entry.payload))
          .digest('hex');
        const prepareResult = await this.checkpointManager.prepare(
          entry.runId,
          entry.projectId,
          {
            domain_scope: 'step_domain',
            state_vector_hash: stateHash,
            policy_epoch: this.now(),
            scheduler_cursor: entry.id,
            tool_side_effect_journal_hwm: 0,
            memory_write_journal_hwm: 0,
            idempotency_key_set_hash: createHash('sha256')
              .update(entry.runId)
              .digest('hex'),
          },
        );
        if (prepareResult.success && prepareResult.checkpoint_id) {
          preparedCheckpointId = prepareResult.checkpoint_id;
          this.healthSink.recordCheckpointPrepared(preparedCheckpointId, this.now());
        }
      } catch {
        // Checkpoint capture is advisory for V1 — proceed without checkpoint
        this.log.warn('checkpoint prepare failed, proceeding without checkpoint');
      }
    }

    // Execute the system entry
    const result = await this.executeSystemEntryInner(entry);

    // Phase 1.2 — Checkpoint capture: commit after successful execution
    if (preparedCheckpointId && this.checkpointManager && result.status !== 'error') {
      try {
        const commitResult = await this.checkpointManager.commit(
          entry.runId,
          preparedCheckpointId,
          `witness:${entry.runId}`,
        );
        if (commitResult.success) {
          this.healthSink.recordCheckpointCommitted(preparedCheckpointId, this.now());
        }
      } catch {
        // Commit failure: checkpoint remains prepared-only
        this.log.warn('checkpoint commit failed');
      }
    }

    // Phase 1.2 — Recovery invocation on system entry error
    if (
      result.status === 'error' &&
      this.recoveryOrchestrator &&
      this.checkpointManager &&
      this.recoveryLedgerStore
    ) {
      try {
        const recoveryContext: RecoveryOrchestratorContext = {
          run_id: entry.runId,
          project_id: entry.projectId ?? 'unknown',
          failure_class: 'retryable_transient',
          ledger_store: this.recoveryLedgerStore,
          checkpoint_manager: this.checkpointManager,
          retry_evaluator: this.retryPolicyEvaluator,
          rollback_evaluator: this.rollbackPolicyEvaluator,
        };

        const terminalState = await this.recoveryOrchestrator.run(recoveryContext);

        switch (terminalState) {
          case 'recovery_completed':
            // Single retry — prevents infinite recursion
            return this.executeSystemEntryInner(entry);

          case 'recovery_failed_hard_stop':
            this.healthSink.recordEscalation('critical', this.now());
            return result;

          case 'recovery_blocked_review_required':
            this.healthSink.recordEscalation('high', this.now());
            await this.principalGateway.getInboxHandle().injectContext(
              createInboxFrame(
                `Recovery blocked — review required for run ${entry.runId}`,
                this.now,
              ),
            );
            this.healthSink.recordEscalationRoutedToPrincipal(this.now());
            return this.buildSyntheticResult(entry, 'escalated', 'recovery_blocked_review_required');
        }
      } catch {
        // Recovery failure must not mask the original error
        this.log.warn('recovery orchestrator failed, propagating original error');
        return result;
      }
    }

    return result;
  }

  /** Core system entry execution — inbox injection, gateway.run, escalation routing. */
  private async executeSystemEntryInner(entry: BacklogEntry) {
    const traceId = this.nextRunId();
    const inboxFrame = entry.payload.inboxFrame as ReturnType<typeof createInboxFrame> | undefined;
    if (inboxFrame) {
      await this.systemGateway.getInboxHandle().injectContext(inboxFrame);
    }

    const { inboxFrame: _ignored, ...payload } = entry.payload;
    this.turnInProgressByClass.set('Cortex::System', true);
    let result;
    try {
      result = await this.systemGateway.run({
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
    } finally {
      this.turnInProgressByClass.set('Cortex::System', false);
      this.checkPendingRecompose('Cortex::System');
    }

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

  private resolveChatResponse(result: AgentResult): { response: string; contentType: 'text' | 'openui'; thinkingContent?: string } {
    if (result.status === 'completed') {
      const output = result.output as { response?: unknown; output?: unknown; contentType?: unknown; thinkingContent?: unknown } | string;

      // Extract thinkingContent from structured output (undefined for direct-string outputs)
      const thinkingContent = (typeof output === 'object' && output !== null && typeof output.thinkingContent === 'string')
        ? output.thinkingContent
        : undefined;

      // 1. Direct string — use as-is
      if (typeof output === 'string') return { response: output, contentType: 'text' };

      // 2. { response: string } — extract .response
      if (typeof output?.response === 'string') {
        const ct = output.contentType === 'openui' ? 'openui' as const : 'text' as const;
        return { response: output.response, contentType: ct, thinkingContent };
      }

      // 3. Recursive one-level unwrap: { output: { response: string } }
      if (
        output &&
        typeof output === 'object' &&
        typeof (output as { output?: { response?: unknown } }).output === 'object' &&
        (output as { output?: { response?: unknown } }).output !== null &&
        typeof ((output as { output: { response?: unknown } }).output).response === 'string'
      ) {
        return {
          response: ((output as { output: { response: string } }).output).response,
          contentType: 'text',
          thinkingContent,
        };
      }

      // 4. Single-string-key extraction: object with exactly one key whose value is a string
      if (output && typeof output === 'object') {
        const keys = Object.keys(output as object);
        if (keys.length === 1) {
          const value = (output as Record<string, unknown>)[keys[0]];
          if (typeof value === 'string') {
            return { response: value, contentType: 'text', thinkingContent };
          }
        }
      }

      // 5. Fallback — pretty-printed JSON wrapped in code block
      return {
        response: '```json\n' + JSON.stringify(output, null, 2) + '\n```',
        contentType: 'text',
        thinkingContent,
      };
    }
    if (result.status === 'escalated') return { response: `[escalated: ${result.reason}]`, contentType: 'text' };
    if (result.status === 'budget_exhausted') return { response: '[budget exhausted]', contentType: 'text' };
    if (result.status === 'aborted') return { response: `[aborted: ${result.reason}]`, contentType: 'text' };
    if (result.status === 'suspended') return { response: `[suspended: ${result.reason}]`, contentType: 'text' };
    return { response: `[error: ${result.reason}]`, contentType: 'text' };
  }

  private buildChatContextFrames(stmContext: StmContext): GatewayContextFrame[] {
    const frames: GatewayContextFrame[] = [];
    if (stmContext.summary) {
      frames.push(GatewayContextFrameSchema.parse({
        role: 'system',
        source: 'initial_context',
        content: `Summary: ${stmContext.summary}`,
        createdAt: this.now(),
      }));
    }
    for (const entry of stmContext.entries ?? []) {
      frames.push(GatewayContextFrameSchema.parse({
        role: entry.role,
        source: 'initial_context',
        content: entry.content,
        createdAt: entry.timestamp,
      }));
    }
    return frames;
  }

  private async finalizeChatStmTurn(
    projectId: string | undefined,
    userMessage: string,
    assistantResponse: string,
    traceId: string,
    evidenceRefs: TraceEvidenceReference[],
    contentType?: 'text' | 'openui',
  ): Promise<void> {
    if (!projectId || !this.deps.stmStore) return;

    const timestamp = this.now();
    try {
      await this.deps.stmStore.append(projectId as ProjectId, {
        role: 'user',
        content: userMessage,
        timestamp,
      });
      const entry: { role: 'assistant'; content: string; timestamp: string; metadata?: Record<string, unknown> } = {
        role: 'assistant',
        content: assistantResponse,
        timestamp,
      };
      if (contentType && contentType !== 'text') {
        entry.metadata = { contentType };
      }
      await this.deps.stmStore.append(projectId as ProjectId, entry);

      const stmContext = await this.deps.stmStore.getContext(projectId as ProjectId);
      if (!stmContext.compactionState?.requiresCompaction) return;

      if (this.deps.mwcPipeline) {
        await this.deps.mwcPipeline.mutate({
          action: 'compact-stm',
          actor: 'pfc',
          projectId: projectId as ProjectId,
          reason: 'Automatic STM compaction due to token threshold',
          traceId: traceId as TraceId,
          evidenceRefs,
        });
      }
    } catch {
      // Preserve chat-path availability even if STM finalization fails.
      this.log.warn('handleChatTurn: STM finalization failed, chat response preserved');
    }
  }

  /**
   * Creates gateway config for any agent class.
   *
   * SP 1.3: Simplified — no longer wraps providers with input transform or
   * synthesizes task_complete. The adapter pattern (formatRequest/parseResponse)
   * handles provider-specific formatting, and the profile's loopConfig.singleTurn
   * handles Principal gateway exit behavior.
   */
  private createGatewayConfig(args: {
    agentClass: AgentClass;
    agentId: string;
    toolSurface: AgentGatewayConfig['toolSurface'];
    lifecycleHooks: AgentGatewayConfig['lifecycleHooks'];
    baseSystemPrompt: string;
    outbox?: IGatewayOutboxSink;
  }): AgentGatewayConfig {
    // WR-138 row #5: Option α vendor resolution chain per
    // `cortex-provider-attach-lifecycle-v1.md` AC #9 and
    // `provider-vendor-field-v1.md` § 6.
    //
    // Step 1 (`modelProviderByClass?[class]`) preserves behavioral parity
    //   for the existing test fixture family that wires the mock-friendly dep.
    // Step 2 (`getProvider(providerIdByClass[class])`) is the production
    //   dispatch path for Orchestrator and Worker (and the post-attach path
    //   for Principal/System after bootstrap calls attachProviders()).
    // Step 3 (`.getConfig().vendor ?? 'text'`) is the final read with a
    //   safe text-adapter fallback (the intentional placeholder behavior
    //   per CPAL § 3).
    const directProvider = this.deps.modelProviderByClass?.[args.agentClass];
    const provider =
      directProvider ??
      (this.deps.providerIdByClass?.[args.agentClass] && this.deps.getProvider
        ? (this.deps.getProvider(
            this.deps.providerIdByClass[args.agentClass]!,
          ) ?? undefined)
        : undefined);
    const providerType = provider?.getConfig().vendor ?? 'text';
    const harness = this.composeHarnessStrategies(args.agentClass, providerType);

    return {
      agentClass: args.agentClass,
      agentId: args.agentId as AgentGatewayConfig['agentId'],
      toolSurface: args.toolSurface,
      lifecycleHooks: args.lifecycleHooks,
      outbox: args.outbox,
      baseSystemPrompt: args.baseSystemPrompt,
      harness,
      defaultModelRequirements: this.deps.defaultModelRequirements,
      witnessService: this.deps.witnessService,
      modelProvider: provider,
      modelRouter: provider ? undefined : this.deps.modelRouter,
      getProvider: provider ? undefined : this.deps.getProvider,
      now: this.now,
      nowMs: this.nowMs,
      idFactory: this.idFactory,
      log: this.deps.logger?.channel('nous:gateway'),
    };
  }

  /**
   * Compose harness strategies for the given agent class and provider type.
   * Adapter is resolved up-front from the vendor string — no lazy closure,
   * no cached adapter, no name-string sniffing, no UUID probing. See WR-138
   * row #5 and `provider-vendor-field-v1.md` § 6.
   */
  private composeHarnessStrategies(
    agentClass: AgentClass,
    providerType: string,
  ): HarnessStrategies {
    const adapter = resolveAdapter(providerType, this.deps.logger?.channel('nous:gateway'));
    const profile = resolveAgentProfile(agentClass);

    return {
      promptFormatter: (input: PromptFormatterInput) =>
        composeFromProfile(profile, adapter.capabilities, input),
      responseParser: (output: unknown, traceId: TraceId) =>
        adapter.parseResponse(output, traceId),
      contextStrategy: profile.contextBudget
        ? {
            getDefaults: () =>
              resolveContextBudget(
                { agentClass },
                profile.contextBudget!,
              ),
          }
        : undefined,
      loopConfig: profile.loopShape
        ? { singleTurn: profile.loopShape === 'single-turn' }
        : undefined,
    };
  }

  private createInternalMcpDeps() {
    return {
      getProjectApi: this.deps.getProjectApi,
      toolExecutor: this.deps.toolExecutor,
      pfc: this.deps.pfc,
      promotedMemoryBridgeService: this.deps.promotedMemoryBridgeService,
      workflowEngine: this.deps.workflowEngine,
      taskStore: this.deps.taskStore,
      documentStore: this.deps.documentStore,
      submitTaskToSystem: (input: import('./types.js').SystemTaskSubmission) => this.submitTaskToSystem(input),
      projectStore: this.deps.projectStore,
      scheduler: this.deps.scheduler,
      escalationService: this.deps.escalationService,
      witnessService: this.deps.witnessService,
      opctlService: this.deps.opctlService,
      runtime: this.deps.runtime,
      appRuntimeService: this.deps.appRuntimeService,
      credentialVaultService: this.deps.credentialVaultService,
      credentialInjector: this.deps.credentialInjector,
      appCredentialInstallService: this.deps.appCredentialInstallService,
      instanceRoot: this.deps.instanceRoot,
      outputSchemaValidator: this.deps.outputSchemaValidator,
      workmodeAdmissionGuard: this.workmodeAdmissionGuard,
      addHealthIssue: (code: string) => this.healthSink.addIssue(code),
      dispatchRuntime: {
        dispatchChild: async (dispatchArgs: {
          request: {
            targetClass: 'Orchestrator' | 'Worker';
            taskInstructions: string;
            payload?: unknown;
            nodeDefinitionId?: string;
            dispatchIntent?: import('@nous/shared').DispatchIntent;
            granted_tools?: string[];
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
          const child = this.createChildGateway(
            dispatchArgs.request.targetClass,
            dispatchArgs.request.dispatchIntent,
            dispatchArgs.request.granted_tools,
          );
          const childRunId = this.nextRunId();
          const childTraceId = this.nextRunId();
          return child.run({
            taskInstructions: dispatchArgs.request.taskInstructions,
            payload: dispatchArgs.request.payload,
            dispatchIntent: dispatchArgs.request.dispatchIntent,
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

  private createChildGateway(
    targetClass: 'Orchestrator' | 'Worker',
    dispatchIntent?: import('@nous/shared').DispatchIntent,
    grantedTools?: string[],
  ): IAgentGateway {
    const childAgentId = this.nextGatewayId();
    const lease = grantedTools && grantedTools.length > 0
      ? {
          lease_id: this.idFactory() as import('@nous/shared').LeaseContract['lease_id'],
          project_run_id: this.idFactory(),
          workmode_id: 'system:implementation' as import('@nous/shared').LeaseContract['workmode_id'],
          entrypoint_ref: 'dispatch-grant',
          sop_ref: 'dispatch-grant',
          scope_ref: 'dispatch-grant',
          context_profile: 'dispatch-grant',
          ttl: 3600,
          issued_by: 'nous_cortex' as const,
          issued_at: this.now(),
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          revocation_ref: null,
          granted_tools: grantedTools,
        }
      : undefined;
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: targetClass,
      agentId: childAgentId as AgentGatewayConfig['agentId'],
      deps: this.createInternalMcpDeps(),
      lease,
    });

    let baseSystemPrompt: string;
    if (targetClass === 'Worker') {
      const workerToolDefs = this.catalogDefinitions('Worker');
      baseSystemPrompt = this.deps.workerBaseSystemPrompt
        ?? composeSystemPromptFromConfig(resolvePromptConfig('Worker'), workerToolDefs);
    } else if (this.deps.orchestratorBaseSystemPrompt) {
      // Dep-injected override takes precedence over intent-based selection.
      baseSystemPrompt = this.deps.orchestratorBaseSystemPrompt;
    } else {
      baseSystemPrompt = getOrchestratorPrompt(dispatchIntent);
    }

    return this.gatewayFactory.create(
      this.createGatewayConfig({
        agentClass: targetClass,
        agentId: childAgentId,
        toolSurface: bundle.toolSurface,
        lifecycleHooks: bundle.lifecycleHooks,
        baseSystemPrompt,
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

  /**
   * Attach providers to Principal and System gateways after the runtime
   * constructor returns. Bootstrap MUST call this exactly once after
   * `ProviderRegistry` is populated — see `cortex-provider-attach-lifecycle-v1.md`
   * §§ 1-7, AC #1-#12 for the full contract.
   *
   * Constructor placeholder behavior: Principal and System gateways are
   * constructed with the text adapter (vendor resolves to `'text'` because
   * `getProvider` returns null before registry population). They are
   * functional as placeholders until `attachProviders` upgrades the harness
   * by swapping the `harness` field on the captured config references — the
   * running gateway instances are NOT recreated, and any external references
   * to `runtime.principalGateway` / `runtime.systemGateway` remain valid.
   *
   * Idempotency per CPAL § 4:
   *   - First call stamps the map and recomposes the affected harnesses.
   *   - Same-map re-call is a no-op (stable entries-equality comparison
   *     tolerates different key ordering per Finding IP-7 Option B).
   *   - Different-map re-call throws a plain `Error` with the verbatim
   *     § 4 message.
   *
   * @param args.providerVendorByClass Vendor key per agent class. Missing
   *   classes stay on the text placeholder. Orchestrator/Worker are NOT
   *   recomposed here (their gateways are created at dispatch time and walk
   *   the Option α chain inside `createGatewayConfig`).
   */
  attachProviders(args: {
    providerVendorByClass: Partial<Record<AgentClass, ProviderVendor>>;
  }): void {
    if (this.attachedVendorByClass !== null) {
      if (this.entriesEqual(this.attachedVendorByClass, args.providerVendorByClass)) {
        // Same-map re-call is a no-op.
        return;
      }
      throw new Error(
        'CortexRuntime.attachProviders called twice with different vendor maps. ' +
          'Bootstrap should call attachProviders exactly once after ProviderRegistry is populated.',
      );
    }

    this.attachedVendorByClass = { ...args.providerVendorByClass };

    // Swap-in-place recompose per CPAL § 5 / Finding IP-5. The gateway object
    // identity is preserved because we mutate the `harness` field on the
    // `AgentGatewayConfig` references the gateways already hold internally.
    const principalVendor = args.providerVendorByClass['Cortex::Principal'];
    if (principalVendor !== undefined) {
      this.principalGatewayConfig.harness = this.composeHarnessStrategies(
        'Cortex::Principal',
        principalVendor,
      );
    }
    const systemVendor = args.providerVendorByClass['Cortex::System'];
    if (systemVendor !== undefined) {
      this.systemGatewayConfig.harness = this.composeHarnessStrategies(
        'Cortex::System',
        systemVendor,
      );
    }
    // Orchestrator and Worker are intentionally NOT recomposed here — their
    // gateways do not exist at boot time and the Option α chain handles them
    // at dispatch time via `createChildGateway -> createGatewayConfig`.
  }

  // ── Runtime harness recomposition (WR-148 phase 1.1 / RC-1) ─────────

  recomposeHarnessForClass(
    agentClass: 'Cortex::Principal' | 'Cortex::System',
    vendorString: ProviderVendor,
  ): void {
    if (this.turnInProgressByClass.get(agentClass)) {
      this.log.info(
        `Deferred harness recompose for ${agentClass} — turn in progress`,
      );
      this.pendingRecompose.set(agentClass, vendorString);
      return;
    }
    this.applyRecompose(agentClass, vendorString);
  }

  private applyRecompose(
    agentClass: 'Cortex::Principal' | 'Cortex::System',
    vendorString: ProviderVendor,
  ): void {
    const config = agentClass === 'Cortex::Principal'
      ? this.principalGatewayConfig
      : this.systemGatewayConfig;
    config.harness = this.composeHarnessStrategies(agentClass, vendorString);
    this.log.info(
      `Recomposed harness for ${agentClass} with vendor ${vendorString}`,
    );
  }

  /** Check and apply any deferred recomposition after a turn completes. */
  private checkPendingRecompose(agentClass: 'Cortex::Principal' | 'Cortex::System'): void {
    const pending = this.pendingRecompose.get(agentClass);
    if (pending !== undefined) {
      this.pendingRecompose.delete(agentClass);
      this.log.info(
        `Applied deferred harness recompose for ${agentClass} with vendor ${pending}`,
      );
      this.applyRecompose(agentClass, pending);
    }
  }

  /**
   * Stable entries-equality comparison for `attachProviders` idempotency
   * per Finding IP-7 Option B. Order-stable (sorts keys) and avoids any
   * JSON.stringify edge cases (undefined, NaN, etc.) for the well-typed
   * shape.
   */
  private entriesEqual(
    a: Partial<Record<AgentClass, ProviderVendor>>,
    b: Partial<Record<AgentClass, ProviderVendor>>,
  ): boolean {
    const ka = (Object.keys(a) as AgentClass[]).sort();
    const kb = (Object.keys(b) as AgentClass[]).sort();
    if (ka.length !== kb.length) return false;
    return ka.every((k, i) => k === kb[i] && a[k] === b[k]);
  }

  /**
   * Emit a single startup warning if the runtime is exercised before
   * `attachProviders` has been called. Per CPAL § 7 and Finding IP-6: fires
   * from the first call to `handleChatTurn` / `submitTask` /
   * `submitIngressEnvelope` when `attachedVendorByClass === null`. Guarded
   * by `attachWarningEmitted` so it fires exactly once per runtime instance.
   */
  private checkAttachOrWarn(): void {
    if (this.attachedVendorByClass === null && !this.attachWarningEmitted) {
      this.log.warn(
        'CortexRuntime exposed without attached vendor map. ' +
          'Principal and System gateways will run with the text adapter. ' +
          'This is likely a bootstrap bug — see cortex-provider-attach-lifecycle-v1.md.',
      );
      this.attachWarningEmitted = true;
    }
  }
}

/** @deprecated Use CortexRuntime directly. Backward-compatible alias. */
export const PrincipalSystemGatewayRuntime = CortexRuntime;

export function createCortexRuntime(
  deps: PrincipalSystemGatewayRuntimeDeps = {},
): IPrincipalSystemGatewayRuntime {
  return new CortexRuntime(deps);
}

/** @deprecated Use createCortexRuntime. Backward-compatible alias. */
export const createPrincipalSystemGatewayRuntime = createCortexRuntime;
