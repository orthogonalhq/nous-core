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
  ILogChannel,
  TraceEvidenceReference,
  TraceId,
} from '@nous/shared';
import { GatewayContextFrameSchema } from '@nous/shared';
import { AgentGatewayFactory, createInboxFrame } from '../agent-gateway/index.js';
import { resolveAdapter, resolveProviderTypeFromConfig } from '../agent-gateway/adapters/index.js';
import {
  createInternalMcpSurfaceBundle,
  getInternalMcpCatalogEntry,
  getVisibleInternalMcpTools,
} from '../internal-mcp/index.js';
import { detectAndStripNarration, parseModelOutput } from '../output-parser.js';
import { CARD_PROMPT_FRAGMENT } from './card-prompt-fragment.js';
import { WORKFLOW_PROMPT_FRAGMENT } from './workflow-prompt-fragment.js';
import { getOrchestratorPrompt } from '../prompts/index.js';
import { resolvePromptConfig, composeSystemPromptFromConfig } from './prompt-strategy.js';
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
  maxTokens: 4096,
  timeoutMs: 120_000,
};

const DEFAULT_CHILD_BUDGET: GatewayBudget = {
  maxTurns: 3,
  maxTokens: 600,
  timeoutMs: 60_000,
};

// DEFAULT_PRINCIPAL_PROMPT, DEFAULT_SYSTEM_PROMPT, DEFAULT_WORKER_PROMPT
// Superseded by prompt-strategy.ts (SP 1.1 — WR-124).
// Use resolvePromptConfig() + composeSystemPromptFromConfig() instead.

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

export class PrincipalSystemGatewayRuntime
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
    this.log = deps.logger?.channel('nous:gateway-runtime') ?? { debug() {}, info() {}, warn() {}, error() {}, isEnabled() { return false; } };

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
          this.deps.principalBaseSystemPrompt
            ?? composeSystemPromptFromConfig(resolvePromptConfig('Cortex::Principal')),
        outbox: new HealthTrackingOutboxSink('Cortex::Principal', this.healthSink, this.deps.eventBus),
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
        baseSystemPrompt: this.deps.systemBaseSystemPrompt
          ?? composeSystemPromptFromConfig(resolvePromptConfig('Cortex::System'), this.systemTools),
        outbox: new HealthTrackingOutboxSink('Cortex::System', this.healthSink, this.deps.eventBus),
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
      workflow_ref: envelope.workflow_ref ?? envelope.task_ref ?? '',
      policy_ref: `gateway-runtime:policy:${envelope.workmode_id}`,
      evidence_ref: `gateway-runtime:ingress:${envelope.trigger_id}`,
    };
  }

  async handleChatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
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

    // Run Principal gateway
    const result = await this.principalGateway.run({
      taskInstructions: `Handle the current user chat turn. Respond conversationally.\n\n${WORKFLOW_PROMPT_FRAGMENT}\n\n${CARD_PROMPT_FRAGMENT}`,
      payload: { message },
      context: contextFrames,
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
          // WR-162 SP 8 — extended-context fields (SUPV-SP8-016).
          // retry_budget / operation_class / side_effect_status omitted
          // intentionally; not knowable from the workflow-engine failure
          // surface (left as `undefined`; orchestrator falls back to
          // documented defaults per SUPV-SP8-007 / SUPV-SP8-009).
          witness: this.deps.witnessService,
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

  private resolveChatResponse(result: AgentResult): { response: string; contentType: 'text' | 'openui' } {
    if (result.status === 'completed') {
      const output = result.output as { response?: unknown; output?: unknown; contentType?: unknown } | string;

      // 1. Direct string — use as-is
      if (typeof output === 'string') return { response: output, contentType: 'text' };

      // 2. { response: string } — extract .response
      if (typeof output?.response === 'string') {
        const ct = output.contentType === 'openui' ? 'openui' as const : 'text' as const;
        return { response: output.response, contentType: ct };
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
        };
      }

      // 4. Single-string-key extraction: object with exactly one key whose value is a string
      if (output && typeof output === 'object') {
        const keys = Object.keys(output as object);
        if (keys.length === 1) {
          const value = (output as Record<string, unknown>)[keys[0]];
          if (typeof value === 'string') {
            return { response: value, contentType: 'text' };
          }
        }
      }

      // 5. Fallback — pretty-printed JSON wrapped in code block
      return {
        response: '```json\n' + JSON.stringify(output, null, 2) + '\n```',
        contentType: 'text',
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

  private createGatewayConfig(args: {
    agentClass: AgentClass;
    agentId: string;
    toolSurface: AgentGatewayConfig['toolSurface'];
    lifecycleHooks: AgentGatewayConfig['lifecycleHooks'];
    baseSystemPrompt: string;
    outbox?: IGatewayOutboxSink;
  }): AgentGatewayConfig {
    const rawProvider = this.deps.modelProviderByClass?.[args.agentClass];
    // Wrap provider to transform gateway input ({ systemPrompt, context, tools })
    // into the provider-expected format ({ messages }) before validation.
    // For Principal: also synthesize task_complete since Principal has no task_complete
    // tool (read-only agent) but the gateway loop requires it to exit.
    const synthesize = args.agentClass === 'Cortex::Principal';
    const provider = rawProvider
      ? this.wrapProviderWithInputTransform(rawProvider, { synthesizeTaskComplete: synthesize })
      : undefined;
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
      modelRouter: rawProvider ? undefined : this.deps.modelRouter,
      getProvider: rawProvider ? undefined : this.deps.getProvider
        ? (providerId: string) => {
            const p = this.deps.getProvider!(providerId);
            return p ? this.wrapProviderWithInputTransform(p, { synthesizeTaskComplete: synthesize }) : null;
          }
        : undefined,
      now: this.now,
      nowMs: this.nowMs,
      idFactory: this.idFactory,
      log: this.deps.logger?.channel('nous:gateway'),
    };
  }

  private wrapProviderWithInputTransform(
    provider: import('@nous/shared').IModelProvider,
    options?: { synthesizeTaskComplete?: boolean },
  ): import('@nous/shared').IModelProvider {
    const providerType = resolveProviderTypeFromConfig(provider);
    const adapter = resolveAdapter(providerType);

    return {
      ...provider,
      invoke: async (request) => {
        const transformedInput = (() => {
          const input = request.input;
          if (typeof input !== 'object' || input === null) return input;
          if ('messages' in input || 'prompt' in input) return input;
          const rec = input as Record<string, unknown>;
          if (typeof rec.systemPrompt !== 'string' || !Array.isArray(rec.context)) return input;
          const result = adapter.formatRequest({
            systemPrompt: rec.systemPrompt as string,
            context: rec.context as import('@nous/shared').GatewayContextFrame[],
            toolDefinitions: Array.isArray(rec.tools) ? rec.tools as import('@nous/shared').ToolDefinition[] : undefined,
          });
          return result.input;
        })();
        const response = await provider.invoke({
          ...request,
          input: transformedInput,
        });

        if (!options?.synthesizeTaskComplete) return response;

        // Synthesize task_complete for agents that produce text responses
        // without calling task_complete (e.g. Principal is read-only and
        // has no task_complete tool). Without this, the gateway loop spins
        // until budget exhaustion.
        const parsed = parseModelOutput(response.output, response.traceId);
        if (parsed.toolCalls.some((tc: { name: string }) => tc.name === 'task_complete')) {
          return response;
        }
        const finalResponse = parsed.response.trim() || String(response.output ?? '');
        return {
          ...response,
          output: JSON.stringify({
            response: '',
            toolCalls: [
              {
                name: 'task_complete',
                params: {
                  output: { response: finalResponse, contentType: parsed.contentType },
                  summary: 'chat turn completed',
                },
              },
            ],
            memoryCandidates: [],
          }),
        };
      },
      stream: provider.stream.bind(provider),
    };
  }

  private createInternalMcpDeps() {
    return {
      getProjectApi: this.deps.getProjectApi,
      toolExecutor: this.deps.toolExecutor,
      pfc: this.deps.pfc,
      promotedMemoryBridgeService: this.deps.promotedMemoryBridgeService,
      workflowEngine: this.deps.workflowEngine,
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
          const child = this.createChildGateway(dispatchArgs.request.targetClass, dispatchArgs.request.dispatchIntent);
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
  ): IAgentGateway {
    const childAgentId = this.nextGatewayId();
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: targetClass,
      agentId: childAgentId as AgentGatewayConfig['agentId'],
      deps: this.createInternalMcpDeps(),
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
   * WR-138 stub: this legacy runtime class has zero production callers and
   * is queued for deletion in a separate cleanup WR (see sub-phase 1.1
   * Out-of-Scope #2). The stub exists solely to satisfy the
   * `IPrincipalSystemGatewayRuntime` interface contract — this class never
   * runs in production, so the method body is a no-op. When the cleanup WR
   * deletes this file, this stub is deleted with it. Do NOT adopt this
   * class into production without re-reading
   * `.architecture/.decisions/2026-04-08-provider-type-plumbing/cortex-provider-attach-lifecycle-v1.md`.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  attachProviders(_args: {
    providerVendorByClass: Partial<Record<AgentClass, import('@nous/shared').ProviderVendor>>;
  }): void {
    // no-op: legacy class, not wired into production
  }

  /**
   * WR-148 stub: runtime harness recomposition. No-op in this legacy runtime
   * class — exists solely to satisfy the IPrincipalSystemGatewayRuntime
   * interface contract.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  recomposeHarnessForClass(
    _agentClass: 'Cortex::Principal' | 'Cortex::System',
    _vendorString: import('@nous/shared').ProviderVendor,
  ): void {
    // no-op: legacy class, not wired into production
  }

  /**
   * WR-162 SP 3 (Option A — thin-throw). The legacy class does not
   * implement supervision; it remains dormant-but-compiled per SDS §
   * Invariants. Preserves `implements IPrincipalSystemGatewayRuntime`
   * conformance after task 17 extends the interface with
   * `startSupervision`. UT-5a locks the diagnostic surface.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  startSupervision(
    _config: import('@nous/shared').SupervisorConfig,
  ): import('@nous/shared').ISupervisorHandle {
    throw new Error(
      'PrincipalSystemGatewayRuntime (legacy) does not support startSupervision; construct the runtime via createCortexRuntime / CortexRuntime instead.',
    );
  }
}

export function createPrincipalSystemGatewayRuntime(
  deps: PrincipalSystemGatewayRuntimeDeps = {},
): IPrincipalSystemGatewayRuntime {
  return new PrincipalSystemGatewayRuntime(deps);
}
