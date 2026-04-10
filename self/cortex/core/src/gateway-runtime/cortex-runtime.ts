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
  PromptFormatterInput,
  IModelProvider,
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
  private readonly principalTools: ToolDefinition[];
  private readonly systemTools: ToolDefinition[];
  private readonly systemBacklogQueue: SystemBacklogQueue;

  // Recovery component slots (Phase 1.2 — WR-072)
  private readonly checkpointManager?: ICheckpointManager;
  private readonly recoveryLedgerStore?: IRecoveryLedgerStore;
  private readonly recoveryOrchestrator?: IRecoveryOrchestrator;
  private readonly retryPolicyEvaluator: IRetryPolicyEvaluator;
  private readonly rollbackPolicyEvaluator: IRollbackPolicyEvaluator;

  constructor(private readonly deps: PrincipalSystemGatewayRuntimeDeps = {}) {
    this.healthSink = new GatewayRuntimeHealthSink({ eventBus: deps.eventBus });
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
      console.warn('Using in-memory document store for backlog queue -- queued work will not survive restart.');
    }
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
        console.warn('[nous:gateway-runtime] handleChatTurn: opctl gate check failed, allowing execution');
      }
    }

    // Load STM context
    let contextFrames: GatewayContextFrame[] = [];
    if (projectId && this.deps.stmStore) {
      try {
        const stmContext = await this.deps.stmStore.getContext(projectId as ProjectId);
        contextFrames = this.buildChatContextFrames(stmContext);
      } catch {
        console.warn('[nous:gateway-runtime] handleChatTurn: STM context load failed, proceeding without history');
      }
    } else if (projectId && !this.deps.stmStore) {
      console.warn('[nous:gateway-runtime] handleChatTurn: stmStore not available, proceeding without conversation history');
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

    // Run Principal gateway
    const result = await this.principalGateway.run({
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

    // Resolve response
    const resolved = this.resolveChatResponse(result);

    // Normalize — strip chain-of-thought narration if detected
    const normalized = detectAndStripNarration(resolved.response);
    if (normalized.wasNarrated) {
      console.debug('[nous:gateway-runtime] handleChatTurn: narration detected and stripped');
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
        console.warn('[nous:gateway-runtime] opctl gate check failed, allowing execution');
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
        console.warn('[nous:gateway-runtime] checkpoint prepare failed, proceeding without checkpoint');
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
        console.warn('[nous:gateway-runtime] checkpoint commit failed');
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
        console.warn('[nous:gateway-runtime] recovery orchestrator failed, propagating original error');
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
      console.warn('[nous:gateway-runtime] handleChatTurn: STM finalization failed, chat response preserved');
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
    const provider = this.deps.modelProviderByClass?.[args.agentClass];
    const providerType = this.resolveProviderType(provider);
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
    };
  }

  /**
   * Resolve the provider vendor type string (e.g. 'anthropic', 'openai', 'ollama')
   * from the provider's config name. Falls back to 'text' for unknown providers,
   * which uses the text adapter (preserving current behavior).
   */
  private resolveProviderType(provider?: IModelProvider): string {
    const resolve = (p: IModelProvider): string | null => {
      try {
        const config = p.getConfig();
        const name = (config.name ?? config.type ?? '').toLowerCase();
        if (name.includes('anthropic') || name.includes('claude')) return 'anthropic';
        if (name.includes('openai') || name.includes('gpt')) return 'openai';
        if (name.includes('ollama')) return 'ollama';
        return null;
      } catch {
        return null;
      }
    };

    // Try direct provider first
    if (provider) {
      return resolve(provider) ?? 'text';
    }

    // No direct provider mapped — probe registered providers via getProvider.
    // This handles the common case where bootstrap uses modelRouter + getProvider
    // instead of modelProviderByClass.
    console.debug('[nous:cortex-runtime] resolveProviderType: no direct provider, probing deps', {
      hasGetProvider: !!this.deps.getProvider,
      hasModelRouter: !!this.deps.modelRouter,
      hasModelProviderByClass: !!this.deps.modelProviderByClass,
    });
    if (this.deps.getProvider) {
      const WELL_KNOWN_IDS = [
        '10000000-0000-0000-0000-000000000003', // ollama
        '10000000-0000-0000-0000-000000000001', // anthropic
        '10000000-0000-0000-0000-000000000002', // openai
      ];
      for (const id of WELL_KNOWN_IDS) {
        const p = this.deps.getProvider(id);
        console.debug('[nous:cortex-runtime] probing provider', { id, found: !!p, config: p ? p.getConfig() : null });
        if (p) {
          const type = resolve(p);
          if (type) return type;
        }
      }
    }

    console.debug('[nous:cortex-runtime] resolveProviderType: falling back to text');
    return 'text';
  }

  /**
   * Compose harness strategies for the given agent class and provider type.
   * This replaces the old wrapProviderWithInputTransform and synthesizeTaskComplete
   * hacks with the composable adapter pattern.
   */
  private composeHarnessStrategies(
    agentClass: AgentClass,
    _providerType: string,
  ): HarnessStrategies {
    // Resolve adapter lazily — providers may not be registered yet at
    // construction time (bootstrap registers them after runtime creation).
    let cachedAdapter: ReturnType<typeof resolveAdapter> | null = null;
    const getAdapter = () => {
      if (!cachedAdapter) {
        const resolvedType = this.resolveProviderType(
          this.deps.modelProviderByClass?.[agentClass],
        );
        cachedAdapter = resolveAdapter(resolvedType);
        console.debug('[nous:cortex-runtime] lazy adapter resolved', { agentClass, resolvedType });
      }
      return cachedAdapter;
    };

    const profile = resolveAgentProfile(agentClass);

    return {
      promptFormatter: (input: PromptFormatterInput) =>
        composeFromProfile(profile, getAdapter().capabilities, input),
      responseParser: (output: unknown, traceId: TraceId) =>
        getAdapter().parseResponse(output, traceId),
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
