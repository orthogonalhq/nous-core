import { randomUUID } from 'node:crypto';
import {
  AgentInputSchema,
  AgentResultSchema,
  GatewayContextFrameSchema,
  NousError,
  ValidationError,
  type AgentClass,
  type AgentGatewayConfig,
  type AgentInput,
  type AgentResult,
  type CriticalActionCategory,
  type GatewayBudgetExhaustionReason,
  type GatewayContextFrame,
  type DispatchOrchestratorRequest,
  type DispatchWorkerRequest,
  type GatewayMessageId,
  type GatewayExecutionContext,
  type GatewayLifecycleContext,
  type GatewayObservation,
  type GatewayTaskCompletionRequest,
  type IAgentGateway,
  type IAgentGatewayFactory,
  type IModelProvider,
  type ModelRole,
  type ProjectId,
  type RouteContext,
  type TraceEvidenceReference,
  type TraceId,
  type WitnessActor,
  type WitnessEventId,
} from '@nous/shared';
import { parseModelOutput, type ParsedModelOutput } from '../output-parser.js';
import {
  BudgetTracker,
  estimateBudgetUnits,
  estimateUsageUnits,
} from './budget-tracker.js';
import { CorrelationSequencer } from './correlation-sequencer.js';
import { GatewayInbox } from './inbox.js';
import {
  DISPATCH_ORCHESTRATOR_TOOL_NAME,
  DISPATCH_WORKER_TOOL_NAME,
  FLAG_OBSERVATION_TOOL_NAME,
  REQUEST_ESCALATION_TOOL_NAME,
  TASK_COMPLETE_TOOL_NAME,
  getLifecycleUnavailableMessage,
  isDispatchToolName,
  parseDispatchOrchestratorRequest,
  parseDispatchWorkerRequest,
  parseEscalationRequest,
  parseObservation,
  parseTaskCompletionRequest,
} from './lifecycle-hooks.js';
import { GatewayOutbox } from './outbox.js';
import { composeSystemPrompt } from './system-prompt-composer.js';
import { resolveAdapter, resolveProviderTypeFromConfig } from './adapters/index.js';
import type { ILogChannel } from '@nous/shared';
import type { ProviderAdapter } from './adapters/types.js';

/** No-op log channel used when no ILogChannel is provided. */
const NOOP_LOG: ILogChannel = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  isEnabled() { return false; },
};

const DEFAULT_MODEL_ROLE_BY_CLASS: Record<AgentClass, ModelRole> = {
  'Cortex::Principal': 'cortex-chat',
  'Cortex::System': 'cortex-system',
  Orchestrator: 'orchestrators',
  Worker: 'workers',
};

function deriveDefaultModelRole(agentClass: AgentClass | undefined): ModelRole {
  if (!agentClass) return 'cortex-chat'; // I5 first-run fallback
  return DEFAULT_MODEL_ROLE_BY_CLASS[agentClass];
}

const DEFAULT_MODEL_REQUIREMENTS = {
  profile: 'review-standard',
  fallbackPolicy: 'block_if_unmet' as const,
};

const WITNESS_ACTOR_BY_CLASS: Record<AgentClass, WitnessActor> = {
  'Cortex::Principal': 'principal',
  'Cortex::System': 'system',
  Orchestrator: 'orchestration_agent',
  Worker: 'worker_agent',
};

interface ToolHandlingResult {
  terminalResult?: AgentResult;
  contextFrame?: GatewayContextFrame;
}

interface PreparedDispatchCall {
  request: DispatchOrchestratorRequest | DispatchWorkerRequest;
  toolName: string;
}

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultNowMs(): number {
  return Date.now();
}

export class AgentGateway implements IAgentGateway {
  readonly agentClass: AgentClass;
  readonly agentId: AgentGatewayConfig['agentId'];

  private readonly inbox: GatewayInbox;
  private readonly outbox: GatewayOutbox;
  private readonly now: () => string;
  private readonly nowMs: () => number;
  private readonly idFactory: () => string;
  private readonly log: ILogChannel;
  private cachedAdapter: ProviderAdapter | null = null;

  constructor(private readonly config: AgentGatewayConfig) {
    this.agentClass = config.agentClass;
    this.agentId = config.agentId;
    this.now = config.now ?? defaultNow;
    this.nowMs = config.nowMs ?? defaultNowMs;
    this.idFactory = config.idFactory ?? randomUUID;
    this.log = config.log ?? NOOP_LOG;
    this.inbox = new GatewayInbox(this.now, this.idFactory);
    this.outbox = new GatewayOutbox(config.outbox);

    if (!config.modelProvider && (!config.modelRouter || !config.getProvider)) {
      throw new NousError(
        'AgentGateway requires modelProvider or modelRouter + getProvider',
        'CONFIG_ERROR',
      );
    }
  }

  /**
   * Lazily resolves a ProviderAdapter from the provider's config name.
   * Uses the same heuristic as CortexRuntime.resolveProviderType.
   * Caches after first resolution for the gateway's lifetime.
   */
  private resolveAdapterFromProvider(provider: IModelProvider): ProviderAdapter {
    if (this.cachedAdapter) return this.cachedAdapter;
    const providerType = resolveProviderTypeFromConfig(provider);
    this.cachedAdapter = resolveAdapter(providerType);
    this.log.debug('adapter resolved', { agentClass: this.agentClass, providerType });
    return this.cachedAdapter;
  }

  getInboxHandle() {
    return this.inbox.getHandle();
  }

  async run(input: AgentInput): Promise<AgentResult> {
    const parsed = AgentInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid AgentInput',
        parsed.error.errors.map((error) => ({
          path: error.path.join('.'),
          message: error.message,
        })),
      );
    }

    const validInput = parsed.data;
    const startedAt = this.now();
    const traceId = this.resolveTraceId(validInput.execution);
    const projectId = validInput.execution?.projectId;
    const budgetTracker = new BudgetTracker({
      budget: validInput.budget,
      spawnBudgetCeiling: validInput.spawnBudgetCeiling,
      nowMs: this.nowMs,
    });
    const sequencer = CorrelationSequencer.fromCorrelation(validInput.correlation);
    const evidenceRefs: TraceEvidenceReference[] = [];
    const context = this.createInitialContext(validInput);

    try {
      while (true) {
        const abort = await this.applyInboxMessages(context);
        if (abort) {
          return this.finalizeTerminalResult(
            this.buildAbortedResult(
              abort.reason,
              sequencer.snapshot(),
              budgetTracker,
              evidenceRefs,
            ),
            'gateway:aborted',
            traceId,
            projectId,
          );
        }

        const tools = await this.config.toolSurface.listTools();
        const provider = await this.resolveProvider(validInput, traceId);

        // Strategy delegation: promptFormatter (harness) or composeSystemPrompt (built-in)
        let systemPrompt: string | string[];
        if (this.config.harness?.promptFormatter) {
          const formatted = this.config.harness.promptFormatter({
            agentClass: this.agentClass,
            taskInstructions: validInput.taskInstructions,
            baseSystemPrompt: this.config.baseSystemPrompt,
            execution: validInput.execution,
            tools,
          });
          systemPrompt = formatted.systemPrompt;
        } else {
          systemPrompt = composeSystemPrompt({
            agentClass: this.agentClass,
            taskInstructions: validInput.taskInstructions,
            baseSystemPrompt: this.config.baseSystemPrompt,
            execution: validInput.execution,
            tools,
          });
        }

        const correlation = sequencer.snapshot();

        // Use adapter.formatRequest() — converts { systemPrompt, context, toolDefinitions }
        // into provider-specific format (Anthropic, OpenAI, Ollama, or text).
        const adapter = this.resolveAdapterFromProvider(provider);
        const formatted = adapter.formatRequest({ systemPrompt, context, toolDefinitions: tools });

        // Extract the last user message from context for logging
        const lastUserFrame = [...context].reverse().find(f => f.role === 'user');

        this.log.debug('invoke provider', {
          agentClass: this.agentClass,
          hasHarness: !!this.config.harness,
          inputKeys: Object.keys(formatted.input),
          userMessage: lastUserFrame?.content?.slice(0, 500) ?? '(no user message)',
        });

        const modelResponse = await provider.invoke({
          role: this.config.modelRole ?? deriveDefaultModelRole(this.config.agentClass),
          input: formatted.input,
          projectId,
          traceId,
          agentClass: this.agentClass,
          correlationRunId: correlation.runId,
          correlationParentId: correlation.parentId,
        });

        budgetTracker.recordModelUsage(modelResponse.usage);

        this.log.debug('model response received', {
          agentClass: this.agentClass,
          outputType: typeof modelResponse.output,
          outputLength: typeof modelResponse.output === 'string' ? modelResponse.output.length : 'non-string',
          hasUsage: !!modelResponse.usage,
          rawOutput: modelResponse.output,
        });

        // Strategy delegation: responseParser (harness) or parseModelOutput (built-in)
        const usingHarnessParser = !!this.config.harness?.responseParser;
        const parsedOutput: ParsedModelOutput = usingHarnessParser
          ? (this.config.harness!.responseParser!(modelResponse.output, traceId) as ParsedModelOutput)
          : parseModelOutput(modelResponse.output, traceId);

        this.log.debug('parser selection', {
          usingHarnessParser,
          outputType: typeof modelResponse.output,
          parsedResponse: parsedOutput.response.slice(0, 100),
          parsedToolCalls: parsedOutput.toolCalls.length,
          parsedThinking: !!parsedOutput.thinkingContent,
        });

        this.log.debug('parsed output', {
          agentClass: this.agentClass,
          responseLength: parsedOutput.response.length,
          toolCallCount: parsedOutput.toolCalls.length,
          contentType: parsedOutput.contentType,
          hasThinking: !!parsedOutput.thinkingContent,
          singleTurn: !!this.config.harness?.loopConfig?.singleTurn,
        });

        if (parsedOutput.response.trim() || parsedOutput.toolCalls.length > 0) {
          const metadata: Record<string, unknown> | undefined =
            parsedOutput.toolCalls.length > 0
              ? {
                  tool_calls: parsedOutput.toolCalls.map((tc) => ({
                    id: tc.id,
                    name: tc.name,
                    input: tc.params,
                  })),
                }
              : undefined;
          context.push(
            this.createContextFrame(
              'assistant',
              'model_output',
              parsedOutput.response,
              undefined,
              metadata,
            ),
          );
        }

        // Single-turn exit: return immediately after one model invocation.
        // No tool handling, no task_complete required.
        if (this.config.harness?.loopConfig?.singleTurn) {
          this.log.debug('single-turn exit', { agentClass: this.agentClass });
          budgetTracker.recordTurn();
          return this.finalizeTerminalResult(
            this.buildSingleTurnResult(
              parsedOutput, sequencer, budgetTracker, evidenceRefs,
              validInput, context.length, startedAt,
            ),
            'gateway:completed',
            traceId,
            projectId,
          );
        }

        // Conversational exit: if the model responded with text and no tool
        // calls, the turn is complete. Only continue looping when there are
        // pending tool calls to execute.
        if (parsedOutput.toolCalls.length === 0 && parsedOutput.response.trim()) {
          this.log.debug('conversational exit (no tool calls)', { agentClass: this.agentClass });
          budgetTracker.recordTurn();
          return this.finalizeTerminalResult(
            this.buildSingleTurnResult(
              parsedOutput, sequencer, budgetTracker, evidenceRefs,
              validInput, context.length, startedAt,
            ),
            'gateway:completed',
            traceId,
            projectId,
          );
        }

        const handledTurn = await this.handleToolCalls({
          input: validInput,
          toolCalls: parsedOutput.toolCalls,
          budgetTracker,
          sequencer,
          traceId,
          projectId,
          evidenceRefs,
          context,
          startedAt,
        });
        let terminalResult = handledTurn.terminalResult;

        for (const frame of handledTurn.contextFrames) {
          context.push(frame);
        }

        await this.emitTurnAck(sequencer, budgetTracker, traceId, projectId, evidenceRefs);
        budgetTracker.recordTurn();

        if (terminalResult) {
          terminalResult = this.refreshTerminalResult(
            terminalResult,
            sequencer.snapshot(),
            budgetTracker,
            validInput,
            context.length,
            startedAt,
          );
        }

        if (!terminalResult) {
          const exhausted = budgetTracker.getExhaustedReason();
          if (exhausted) {
            terminalResult = this.buildBudgetExhaustedResult(
              exhausted,
              sequencer.snapshot(),
              budgetTracker,
              evidenceRefs,
              validInput,
              context.length,
              startedAt,
            );
          }
        }

        if (terminalResult) {
          return this.finalizeTerminalResult(
            terminalResult,
            `gateway:${terminalResult.status}`,
            traceId,
            projectId,
          );
        }
      }
    } catch (error) {
      this.log.error('run() error', {
        agentClass: this.agentClass,
        errorName: (error as Error).name,
        errorMessage: (error as Error).message,
        errorCode: (error as NousError).code,
        hasHarness: !!this.config.harness,
      });
      const result =
        error instanceof NousError && error.code === 'LEASE_HELD'
          ? this.buildSuspendedResult(
            error.message,
            sequencer.snapshot(),
            budgetTracker,
            evidenceRefs,
            {
              traceId,
              ...error.context,
            },
          )
          : this.buildErrorResult(
            error instanceof Error ? error.message : String(error),
            sequencer.snapshot(),
            budgetTracker,
            evidenceRefs,
            { traceId },
          );
      return this.finalizeTerminalResult(result, 'gateway:error', traceId, projectId);
    }
  }

  private createInitialContext(input: AgentInput): GatewayContextFrame[] {
    const context = input.context.map((frame) => GatewayContextFrameSchema.parse(frame));
    if (input.payload !== undefined) {
      context.push(
        this.createContextFrame('user', 'initial_payload', stringifyValue(input.payload)),
      );
    }
    return context;
  }

  private async applyInboxMessages(
    context: GatewayContextFrame[],
  ): Promise<{ reason: string } | null> {
    const messages = await this.inbox.drain();
    for (const message of messages) {
      if (message.type === 'abort') {
        return { reason: message.reason };
      }
      for (const frame of message.frames) {
        context.push(GatewayContextFrameSchema.parse(frame));
      }
    }
    return null;
  }

  private async handleToolCall(args: {
    input: AgentInput;
    toolName: string;
    params: unknown;
    toolCallId?: string;
    budgetTracker: BudgetTracker;
    sequencer: CorrelationSequencer;
    traceId: TraceId;
    projectId?: ProjectId;
    evidenceRefs: TraceEvidenceReference[];
    context: GatewayContextFrame[];
    startedAt: string;
  }): Promise<ToolHandlingResult> {
    switch (args.toolName) {
      case DISPATCH_ORCHESTRATOR_TOOL_NAME:
      case DISPATCH_WORKER_TOOL_NAME:
        return this.handleDispatchTool(args);
      case TASK_COMPLETE_TOOL_NAME:
        return this.handleTaskCompleteTool(args);
      case REQUEST_ESCALATION_TOOL_NAME:
        return this.handleEscalationTool(args);
      case FLAG_OBSERVATION_TOOL_NAME:
        return this.handleObservationTool(args);
      default:
        return this.handleStandardTool(args);
    }
  }

  private async handleToolCalls(args: {
    input: AgentInput;
    toolCalls: Array<{ name: string; params: unknown; id?: string }>;
    budgetTracker: BudgetTracker;
    sequencer: CorrelationSequencer;
    traceId: TraceId;
    projectId?: ProjectId;
    evidenceRefs: TraceEvidenceReference[];
    context: GatewayContextFrame[];
    startedAt: string;
  }): Promise<{ contextFrames: GatewayContextFrame[]; terminalResult?: AgentResult }> {
    const contextFrames: GatewayContextFrame[] = [];
    const terminalByIndex = new Map<number, AgentResult>();
    const frameByIndex = new Map<number, GatewayContextFrame>();
    const dispatchIndexes = args.toolCalls
      .map((toolCall, index) =>
        isDispatchToolName(toolCall.name) ? index : -1,
      )
      .filter((index) => index >= 0);

    const dispatchResults =
      dispatchIndexes.length > 1
        ? await this.handleDispatchBatch(args, dispatchIndexes)
        : new Map<number, ToolHandlingResult>();

    this.log.debug('handleToolCalls', {
      toolCallCount: args.toolCalls.length,
      toolCalls: args.toolCalls.map((tc, i) => ({
        index: i,
        name: tc.name,
        id: tc.id ?? '(no id)',
      })),
    });

    for (let index = 0; index < args.toolCalls.length; index += 1) {
      const toolCall = args.toolCalls[index];
      const handled =
        dispatchResults.get(index) ??
        (await this.handleToolCall({
          ...args,
          toolName: toolCall.name,
          params: toolCall.params,
          toolCallId: toolCall.id,
        }));

      if (handled.contextFrame) {
        frameByIndex.set(index, handled.contextFrame);
        this.log.debug('tool result frame', {
          index,
          toolName: toolCall.name,
          toolCallId: toolCall.id ?? '(no id)',
          frameRole: handled.contextFrame.role,
          frameSource: handled.contextFrame.source,
          hasToolCallIdMetadata: !!handled.contextFrame.metadata?.tool_call_id,
          metadataToolCallId: handled.contextFrame.metadata?.tool_call_id ?? '(none)',
        });
      }
      if (handled.terminalResult) {
        terminalByIndex.set(index, handled.terminalResult);
      }
      if (handled.terminalResult) {
        break;
      }
    }

    for (let index = 0; index < args.toolCalls.length; index += 1) {
      const frame = frameByIndex.get(index);
      if (frame) {
        contextFrames.push(frame);
      }
      if (terminalByIndex.has(index)) {
        return {
          contextFrames,
          terminalResult: terminalByIndex.get(index),
        };
      }
    }

    return { contextFrames };
  }

  private async handleDispatchBatch(
    args: {
      input: AgentInput;
      toolCalls: Array<{ name: string; params: unknown }>;
      budgetTracker: BudgetTracker;
      sequencer: CorrelationSequencer;
      traceId: TraceId;
      projectId?: ProjectId;
      evidenceRefs: TraceEvidenceReference[];
      context: GatewayContextFrame[];
      startedAt: string;
    },
    indexes: number[],
  ): Promise<Map<number, ToolHandlingResult>> {
    const immediate = new Map<number, ToolHandlingResult>();
    const pending: Array<{ index: number; prepared: PreparedDispatchCall }> = [];

    for (const index of indexes) {
      const toolCall = args.toolCalls[index]!;
      const prepared = this.prepareDispatchTool(
        {
          ...args,
          toolName: toolCall.name,
          params: toolCall.params,
        },
        true,
      );

      if ('immediate' in prepared) {
        immediate.set(index, prepared.immediate);
      } else {
        pending.push({ index, prepared: prepared.prepared });
      }
    }

    const settled = await Promise.allSettled(
      pending.map(({ index, prepared }) =>
        this.executePreparedDispatch(
          {
            ...args,
            toolName: args.toolCalls[index]!.name,
            params: args.toolCalls[index]!.params,
          },
          prepared,
        ),
      ),
    );

    settled.forEach((result, offset) => {
      const { index, prepared } = pending[offset]!;
      if (result.status === 'fulfilled') {
        immediate.set(index, result.value);
        return;
      }

      immediate.set(index, {
        contextFrame: this.createContextFrame(
          'tool',
          'tool_error',
          normalizeToolError(prepared.toolName, result.reason),
          prepared.toolName,
        ),
      });
    });

    return immediate;
  }

  private async handleStandardTool(args: {
    input: AgentInput;
    toolName: string;
    params: unknown;
    toolCallId?: string;
    budgetTracker: BudgetTracker;
    sequencer: CorrelationSequencer;
    traceId: TraceId;
    projectId?: ProjectId;
    evidenceRefs: TraceEvidenceReference[];
    context: GatewayContextFrame[];
    startedAt: string;
  }): Promise<ToolHandlingResult> {
    try {
      const value = await this.config.toolSurface.executeTool(
        args.toolName,
        args.params,
        args.input.execution,
      );

      return {
        contextFrame: this.createContextFrame(
          'tool',
          'tool_result',
          stringifyValue(value),
          args.toolName,
          args.toolCallId ? { tool_call_id: args.toolCallId } : undefined,
        ),
      };
    } catch (error) {
      if (isWitnessFailure(error)) {
        return {
          terminalResult: this.buildErrorResult(
            error instanceof Error ? error.message : String(error),
            args.sequencer.snapshot(),
            args.budgetTracker,
            args.evidenceRefs,
            { toolName: args.toolName },
          ),
        };
      }

      return {
        contextFrame: this.createContextFrame(
          'tool',
          'tool_error',
          normalizeToolError(args.toolName, error),
          args.toolName,
          args.toolCallId ? { tool_call_id: args.toolCallId } : undefined,
        ),
      };
    }
  }

  private prepareDispatchTool(
    args: {
      input: AgentInput;
      toolName: string;
      params: unknown;
      budgetTracker: BudgetTracker;
      sequencer: CorrelationSequencer;
      traceId: TraceId;
      projectId?: ProjectId;
      evidenceRefs: TraceEvidenceReference[];
      context: GatewayContextFrame[];
      startedAt: string;
    },
    batchMode: boolean,
  ): { prepared: PreparedDispatchCall } | { immediate: ToolHandlingResult } {
    const isOrchestrator = args.toolName === DISPATCH_ORCHESTRATOR_TOOL_NAME;
    const lifecycleHook = isOrchestrator
      ? this.config.lifecycleHooks?.dispatchOrchestrator
      : this.config.lifecycleHooks?.dispatchWorker;

    if (!lifecycleHook) {
      return {
        immediate: {
          contextFrame: this.createContextFrame(
            'tool',
            'tool_error',
            getLifecycleUnavailableMessage(args.toolName as Parameters<typeof getLifecycleUnavailableMessage>[0]),
            args.toolName,
          ),
        },
      };
    }

    let request: DispatchOrchestratorRequest | DispatchWorkerRequest;
    try {
      request = isOrchestrator
        ? parseDispatchOrchestratorRequest(args.params)
        : parseDispatchWorkerRequest(args.params);
    } catch (error) {
      return {
        immediate: {
          contextFrame: this.createContextFrame(
            'tool',
            'tool_error',
            normalizeToolError(args.toolName, error),
            args.toolName,
          ),
        },
      };
    }

    if (!args.budgetTracker.requestSpawn(estimateBudgetUnits(request.budget))) {
      if (batchMode) {
        return {
          immediate: {
            contextFrame: this.createContextFrame(
              'tool',
              'tool_error',
              `Tool ${args.toolName} failed: spawn budget exceeded`,
              args.toolName,
            ),
          },
        };
      }

      return {
        immediate: {
          terminalResult: this.buildBudgetExhaustedResult(
            'spawn_budget',
            args.sequencer.snapshot(),
            args.budgetTracker,
            args.evidenceRefs,
            args.input,
            args.context.length,
            args.startedAt,
          ),
        },
      };
    }

    return { prepared: { request, toolName: args.toolName } };
  }

  private async executePreparedDispatch(
    args: {
      input: AgentInput;
      toolName: string;
      params: unknown;
      budgetTracker: BudgetTracker;
      sequencer: CorrelationSequencer;
      traceId: TraceId;
      projectId?: ProjectId;
      evidenceRefs: TraceEvidenceReference[];
      context: GatewayContextFrame[];
      startedAt: string;
    },
    prepared: PreparedDispatchCall,
  ): Promise<ToolHandlingResult> {
    try {
      const lifecycleContext = this.buildLifecycleContext(
        args.sequencer.snapshot(),
        args.budgetTracker,
        args.input,
        args.context.length,
        args.startedAt,
      );

      const value = prepared.toolName === DISPATCH_ORCHESTRATOR_TOOL_NAME
        ? await this.config.lifecycleHooks!.dispatchOrchestrator!(
            prepared.request as DispatchOrchestratorRequest,
            lifecycleContext,
          )
        : await this.config.lifecycleHooks!.dispatchWorker!(
            prepared.request as DispatchWorkerRequest,
            lifecycleContext,
          );

      args.budgetTracker.consumeSpawnUnits(estimateUsageUnits(value.usage));

      return {
        contextFrame: this.createContextFrame(
          'tool',
          'child_result',
          stringifyValue(projectChildResult(value)),
          prepared.toolName,
        ),
      };
    } catch (error) {
      if (isWitnessFailure(error)) {
        return {
          terminalResult: this.buildErrorResult(
            error instanceof Error ? error.message : String(error),
            args.sequencer.snapshot(),
            args.budgetTracker,
            args.evidenceRefs,
            { toolName: prepared.toolName },
          ),
        };
      }

      return {
        contextFrame: this.createContextFrame(
          'tool',
          'tool_error',
          normalizeToolError(prepared.toolName, error),
          prepared.toolName,
        ),
      };
    }
  }

  private async handleDispatchTool(args: {
    input: AgentInput;
    toolName: string;
    params: unknown;
    budgetTracker: BudgetTracker;
    sequencer: CorrelationSequencer;
    traceId: TraceId;
    projectId?: ProjectId;
    evidenceRefs: TraceEvidenceReference[];
    context: GatewayContextFrame[];
    startedAt: string;
  }): Promise<ToolHandlingResult> {
    const prepared = this.prepareDispatchTool(args, false);
    if ('immediate' in prepared) {
      return prepared.immediate;
    }

    return this.executePreparedDispatch(args, prepared.prepared);
  }

  private async handleTaskCompleteTool(args: {
    input: AgentInput;
    toolName: string;
    params: unknown;
    budgetTracker: BudgetTracker;
    sequencer: CorrelationSequencer;
    traceId: TraceId;
    projectId?: ProjectId;
    evidenceRefs: TraceEvidenceReference[];
    context: GatewayContextFrame[];
    startedAt: string;
  }): Promise<ToolHandlingResult> {
    if (!this.config.lifecycleHooks?.taskComplete) {
      return {
        contextFrame: this.createContextFrame(
          'tool',
          'tool_error',
          getLifecycleUnavailableMessage(TASK_COMPLETE_TOOL_NAME),
          TASK_COMPLETE_TOOL_NAME,
        ),
      };
    }

    let request: GatewayTaskCompletionRequest;
    try {
      request = parseTaskCompletionRequest(args.params);
    } catch (error) {
      return {
        contextFrame: this.createContextFrame(
          'tool',
          'tool_error',
          normalizeToolError(TASK_COMPLETE_TOOL_NAME, error),
          TASK_COMPLETE_TOOL_NAME,
        ),
      };
    }

    try {
      const value = await this.config.lifecycleHooks!.taskComplete!(
        request,
        this.buildLifecycleContext(
          args.sequencer.snapshot(),
          args.budgetTracker,
          args.input,
          args.context.length,
          args.startedAt,
        ),
      );

      return {
        terminalResult: AgentResultSchema.parse({
          status: 'completed',
          output: value.output,
          v3Packet: value.v3Packet,
          summary: value.summary,
          artifactRefs: value.artifactRefs ?? [],
          correlation: args.sequencer.snapshot(),
          usage: args.budgetTracker.getUsage(),
          evidenceRefs: [
            ...args.evidenceRefs,
            ...(value.evidenceRefs ?? []),
          ],
        }),
      };
    } catch (error) {
      if (isWitnessFailure(error)) {
        return {
          terminalResult: this.buildErrorResult(
            error instanceof Error ? error.message : String(error),
            args.sequencer.snapshot(),
            args.budgetTracker,
            args.evidenceRefs,
            { toolName: TASK_COMPLETE_TOOL_NAME },
          ),
        };
      }

      return {
        contextFrame: this.createContextFrame(
          'tool',
          'tool_error',
          normalizeToolError(TASK_COMPLETE_TOOL_NAME, error),
          TASK_COMPLETE_TOOL_NAME,
        ),
      };
    }
  }

  private async handleEscalationTool(args: {
    input: AgentInput;
    toolName: string;
    params: unknown;
    budgetTracker: BudgetTracker;
    sequencer: CorrelationSequencer;
    traceId: TraceId;
    projectId?: ProjectId;
    evidenceRefs: TraceEvidenceReference[];
    context: GatewayContextFrame[];
    startedAt: string;
  }): Promise<ToolHandlingResult> {
    let request;
    try {
      request = parseEscalationRequest(args.params);
    } catch (error) {
      return {
        contextFrame: this.createContextFrame(
          'tool',
          'tool_error',
          normalizeToolError(REQUEST_ESCALATION_TOOL_NAME, error),
          REQUEST_ESCALATION_TOOL_NAME,
        ),
      };
    }

    if (this.config.lifecycleHooks?.requestEscalation) {
      try {
        await this.config.lifecycleHooks.requestEscalation(
          request,
          this.buildLifecycleContext(
            args.sequencer.snapshot(),
            args.budgetTracker,
            args.input,
            args.context.length,
            args.startedAt,
          ),
        );
      } catch (error) {
        return {
          terminalResult: this.buildErrorResult(
            error instanceof Error ? error.message : String(error),
            args.sequencer.snapshot(),
            args.budgetTracker,
            args.evidenceRefs,
            { toolName: REQUEST_ESCALATION_TOOL_NAME },
          ),
        };
      }
    }

    return {
      terminalResult: AgentResultSchema.parse({
        status: 'escalated',
        reason: request.reason,
        severity: request.severity,
        detail: request.detail,
        contextSnapshot: request.contextSnapshot,
        correlation: args.sequencer.snapshot(),
        usage: args.budgetTracker.getUsage(),
        evidenceRefs: [...args.evidenceRefs],
      }),
    };
  }

  private async handleObservationTool(args: {
    input: AgentInput;
    toolName: string;
    params: unknown;
    budgetTracker: BudgetTracker;
    sequencer: CorrelationSequencer;
    traceId: TraceId;
    projectId?: ProjectId;
    evidenceRefs: TraceEvidenceReference[];
    context: GatewayContextFrame[];
    startedAt: string;
  }): Promise<ToolHandlingResult> {
    let observation: GatewayObservation;
    try {
      observation = parseObservation(args.params);
    } catch (error) {
      return {
        contextFrame: this.createContextFrame(
          'tool',
          'tool_error',
          normalizeToolError(FLAG_OBSERVATION_TOOL_NAME, error),
          FLAG_OBSERVATION_TOOL_NAME,
        ),
      };
    }

    try {
      const correlation = args.sequencer.next();
      await this.outbox.emit({
        type: 'observation',
        eventId: this.nextMessageId(),
        observation,
        correlation,
        usage: args.budgetTracker.getUsage(),
        emittedAt: this.now(),
      });

      if (this.config.lifecycleHooks?.flagObservation) {
        await this.config.lifecycleHooks.flagObservation(
          observation,
          this.buildLifecycleContext(
            correlation,
            args.budgetTracker,
            args.input,
            args.context.length,
            args.startedAt,
          ),
        );
      }

      return {
        contextFrame: this.createContextFrame(
          'tool',
          'runtime',
          `Observation emitted: ${observation.observationType}`,
          FLAG_OBSERVATION_TOOL_NAME,
        ),
      };
    } catch (error) {
      return {
        terminalResult: this.buildErrorResult(
          error instanceof Error ? error.message : String(error),
          args.sequencer.snapshot(),
          args.budgetTracker,
          args.evidenceRefs,
          { toolName: FLAG_OBSERVATION_TOOL_NAME },
        ),
      };
    }
  }

  private async emitTurnAck(
    sequencer: CorrelationSequencer,
    budgetTracker: BudgetTracker,
    traceId: TraceId,
    projectId: ProjectId | undefined,
    evidenceRefs: TraceEvidenceReference[],
  ): Promise<void> {
    const correlation = sequencer.next();
    const turn = budgetTracker.getUsage().turnsUsed + 1;

    const { evidenceRef } = await this.executeWithWitness(
      'trace-persist',
      'gateway:turn_ack',
      traceId,
      projectId,
      { turn },
      async () =>
        this.outbox.emit({
          type: 'turn_ack',
          eventId: this.nextMessageId(),
          turn,
          correlation,
          usage: budgetTracker.getUsage(),
          emittedAt: this.now(),
        }),
    );

    if (evidenceRef) {
      evidenceRefs.push(evidenceRef);
    }
  }

  private buildLifecycleContext(
    correlation: ReturnType<CorrelationSequencer['snapshot']>,
    budgetTracker: BudgetTracker,
    input: AgentInput,
    contextFrameCount: number,
    startedAt: string,
  ): GatewayLifecycleContext {
    return {
      agentId: this.agentId,
      agentClass: this.agentClass,
      correlation,
      execution: input.execution,
      usage: budgetTracker.getUsage(),
      snapshot: {
        agentId: this.agentId,
        agentClass: this.agentClass,
        correlation,
        budget: input.budget,
        usage: budgetTracker.getUsage(),
        startedAt,
        lastUpdatedAt: this.now(),
        contextFrameCount,
        execution: input.execution,
      },
    };
  }

  private buildAbortedResult(
    reason: string,
    correlation: ReturnType<CorrelationSequencer['snapshot']>,
    budgetTracker: BudgetTracker,
    evidenceRefs: TraceEvidenceReference[],
  ): AgentResult {
    return AgentResultSchema.parse({
      status: 'aborted',
      reason,
      correlation,
      usage: budgetTracker.getUsage(),
      evidenceRefs: [...evidenceRefs],
    });
  }

  private buildBudgetExhaustedResult(
    exhausted: GatewayBudgetExhaustionReason,
    correlation: ReturnType<CorrelationSequencer['snapshot']>,
    budgetTracker: BudgetTracker,
    evidenceRefs: TraceEvidenceReference[],
    input: AgentInput,
    contextFrameCount: number,
    startedAt: string,
  ): AgentResult {
    return AgentResultSchema.parse({
      status: 'budget_exhausted',
      exhausted,
      partialState: {
        agentId: this.agentId,
        agentClass: this.agentClass,
        correlation,
        budget: input.budget,
        usage: budgetTracker.getUsage(),
        startedAt,
        lastUpdatedAt: this.now(),
        contextFrameCount,
        execution: input.execution,
      },
      turnsUsed: budgetTracker.getUsage().turnsUsed,
      tokensUsed: budgetTracker.getUsage().tokensUsed,
      correlation,
      usage: budgetTracker.getUsage(),
      evidenceRefs: [...evidenceRefs],
    });
  }

  private buildErrorResult(
    reason: string,
    correlation: ReturnType<CorrelationSequencer['snapshot']>,
    budgetTracker: BudgetTracker,
    evidenceRefs: TraceEvidenceReference[],
    detail: Record<string, unknown> = {},
  ): AgentResult {
    return AgentResultSchema.parse({
      status: 'error',
      reason,
      detail,
      correlation,
      usage: budgetTracker.getUsage(),
      evidenceRefs: [...evidenceRefs],
    });
  }

  private buildSingleTurnResult(
    parsedOutput: ParsedModelOutput,
    sequencer: CorrelationSequencer,
    budgetTracker: BudgetTracker,
    evidenceRefs: TraceEvidenceReference[],
    input: AgentInput,
    contextLength: number,
    startedAt: string,
  ): AgentResult {
    const now = this.now();
    const nowMs = this.nowMs();
    const correlation = sequencer.snapshot();
    return AgentResultSchema.parse({
      status: 'completed' as const,
      output: {
        response: parsedOutput.response,
        contentType: parsedOutput.contentType,
        thinkingContent: parsedOutput.thinkingContent,
      },
      v3Packet: {
        nous: { v: 3 as const },
        route: {
          emitter: { id: `gateway::agent::${this.agentId}::single-turn` },
          target: { id: `gateway::agent::${this.agentId}::single-turn-response` },
        },
        envelope: {
          direction: 'internal' as const,
          type: 'response_packet' as const,
        },
        correlation: {
          handoff_id: this.idFactory(),
          correlation_id: correlation.runId,
          cycle: 'n/a',
          emitted_at_utc: now,
          emitted_at_unix_ms: String(nowMs),
          sequence_in_run: String(correlation.sequence),
        },
        payload: {
          schema: 'gateway:single-turn-response',
          artifact_type: 'single-turn-response',
          data: { response: parsedOutput.response },
        },
        retry: {
          policy: 'value-proportional' as const,
          depth: 'lightweight' as const,
          importance_tier: 'standard' as const,
          expected_quality_gain: 'n/a',
          estimated_tokens: 'n/a',
          estimated_compute_minutes: 'n/a',
          token_price_ref: 'runtime:gateway',
          compute_price_ref: 'runtime:gateway',
          decision: 'accept' as const,
          decision_log_ref: 'runtime:gateway/single-turn',
          benchmark_tier: 'n/a' as const,
          self_repair: {
            required_on_fail_close: true as const,
            orchestration_state: 'deferred' as const,
            approval_role: 'Cortex:System',
            implementation_mode: 'direct' as const,
            plan_ref: 'runtime:gateway/self-repair',
          },
        },
      },
      summary: 'single-turn response',
      correlation,
      usage: budgetTracker.getUsage(),
      evidenceRefs: [...evidenceRefs],
    });
  }

  private buildSuspendedResult(
    reason: string,
    correlation: ReturnType<CorrelationSequencer['snapshot']>,
    budgetTracker: BudgetTracker,
    evidenceRefs: TraceEvidenceReference[],
    detail?: Record<string, unknown>,
  ): AgentResult {
    return AgentResultSchema.parse({
      status: 'suspended',
      reason,
      resumeWhen: 'lease_release',
      detail,
      correlation,
      usage: budgetTracker.getUsage(),
      evidenceRefs: [...evidenceRefs],
    });
  }

  private refreshTerminalResult(
    result: AgentResult,
    correlation: ReturnType<CorrelationSequencer['snapshot']>,
    budgetTracker: BudgetTracker,
    input: AgentInput,
    contextFrameCount: number,
    startedAt: string,
  ): AgentResult {
    switch (result.status) {
      case 'completed':
      case 'escalated':
      case 'aborted':
      case 'error':
      case 'suspended':
        return AgentResultSchema.parse({
          ...result,
          correlation,
          usage: budgetTracker.getUsage(),
        });
      case 'budget_exhausted':
        return this.buildBudgetExhaustedResult(
          result.exhausted,
          correlation,
          budgetTracker,
          result.evidenceRefs,
          input,
          contextFrameCount,
          startedAt,
        );
      default:
        return result;
    }
  }

  private async finalizeTerminalResult(
    result: AgentResult,
    actionRef: string,
    traceId: TraceId,
    projectId?: ProjectId,
  ): Promise<AgentResult> {
    if (!this.config.witnessService) {
      return AgentResultSchema.parse(result);
    }

    try {
      const { evidenceRef } = await this.executeWithWitness(
        'trace-persist',
        actionRef,
        traceId,
        projectId,
        { status: result.status },
        async () => undefined,
      );

      return AgentResultSchema.parse({
        ...result,
        evidenceRefs: [
          ...result.evidenceRefs,
          ...(evidenceRef ? [evidenceRef] : []),
        ],
      });
    } catch (error) {
      if (result.status === 'error') {
        return AgentResultSchema.parse(result);
      }

      return AgentResultSchema.parse({
        status: 'error',
        reason: error instanceof Error ? error.message : String(error),
        detail: { actionRef },
        correlation: result.correlation,
        usage: result.usage,
        evidenceRefs: result.evidenceRefs,
      });
    }
  }

  private async resolveProvider(
    input: AgentInput,
    traceId: TraceId,
  ): Promise<IModelProvider> {
    if (this.config.modelProvider) {
      return this.config.modelProvider;
    }

    const routeContext: RouteContext = {
      projectId: input.execution?.projectId,
      traceId,
      modelRequirements:
        input.modelRequirements ??
        this.config.defaultModelRequirements ??
        DEFAULT_MODEL_REQUIREMENTS,
    };
    const route = await this.config.modelRouter!.routeWithEvidence(
      this.config.modelRole ?? deriveDefaultModelRole(this.config.agentClass),
      routeContext,
    );
    const provider = this.config.getProvider!(route.providerId);
    if (!provider) {
      throw new NousError(
        `Provider ${route.providerId} not found`,
        'PROVIDER_NOT_FOUND',
      );
    }
    return provider;
  }

  private resolveTraceId(execution?: GatewayExecutionContext): TraceId {
    return (execution?.traceId ?? this.idFactory()) as TraceId;
  }

  private nextMessageId(): GatewayMessageId {
    return this.idFactory() as GatewayMessageId;
  }

  private createContextFrame(
    role: GatewayContextFrame['role'],
    source: GatewayContextFrame['source'],
    content: string,
    name?: string,
    metadata?: Record<string, unknown>,
  ): GatewayContextFrame {
    return GatewayContextFrameSchema.parse({
      role,
      source,
      content,
      name,
      metadata,
      createdAt: this.now(),
    });
  }

  private async executeWithWitness<T>(
    actionCategory: CriticalActionCategory,
    actionRef: string,
    traceId: TraceId,
    projectId: ProjectId | undefined,
    detail: Record<string, unknown>,
    operation: () => Promise<T>,
  ): Promise<{ value: T; evidenceRef?: TraceEvidenceReference }> {
    if (!this.config.witnessService) {
      return { value: await operation() };
    }

    let authorizationId: WitnessEventId | undefined;
    try {
      const authorization = await this.config.witnessService.appendAuthorization({
        actionCategory,
        actionRef,
        traceId,
        projectId,
        actor: WITNESS_ACTOR_BY_CLASS[this.agentClass],
        status: 'approved',
        detail,
      });
      authorizationId = authorization.id;

      const value = await operation();
      const completion = await this.config.witnessService.appendCompletion({
        actionCategory,
        actionRef,
        authorizationRef: authorization.id,
        traceId,
        projectId,
        actor: WITNESS_ACTOR_BY_CLASS[this.agentClass],
        status: 'succeeded',
        detail,
      });

      return {
        value,
        evidenceRef: {
          actionCategory,
          authorizationEventId: authorization.id,
          completionEventId: completion.id,
        },
      };
    } catch (error) {
      if (!authorizationId) {
        throw new NousError(
          `Critical action blocked: witness authorization append failed (${error instanceof Error ? error.message : String(error)})`,
          'WITNESS_AUTHORIZATION_FAILED',
        );
      }

      try {
        await this.config.witnessService.appendCompletion({
          actionCategory,
          actionRef,
          authorizationRef: authorizationId,
          traceId,
          projectId,
          actor: WITNESS_ACTOR_BY_CLASS[this.agentClass],
          status: 'failed',
          detail: {
            ...detail,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      } catch (completionError) {
        throw new NousError(
          `Critical action evidence completion failed (${completionError instanceof Error ? completionError.message : String(completionError)})`,
          'WITNESS_COMPLETION_FAILED',
        );
      }

      throw error;
    }
  }
}

export class AgentGatewayFactory implements IAgentGatewayFactory {
  create(config: AgentGatewayConfig): IAgentGateway {
    return new AgentGateway(config);
  }
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeToolError(toolName: string, error: unknown): string {
  return `Tool ${toolName} failed: ${error instanceof Error ? error.message : String(error)}`;
}

function isWitnessFailure(error: unknown): boolean {
  return (
    error instanceof NousError &&
    (error.code === 'WITNESS_AUTHORIZATION_FAILED' ||
      error.code === 'WITNESS_COMPLETION_FAILED')
  );
}

function projectChildResult(result: AgentResult): Record<string, unknown> {
  switch (result.status) {
    case 'completed':
      return {
        status: result.status,
        output: result.output,
        summary: result.summary,
        artifactRefs: result.artifactRefs,
        correlation: result.correlation,
        usage: result.usage,
      };
    case 'escalated':
      return {
        status: result.status,
        reason: result.reason,
        severity: result.severity,
        detail: result.detail,
        contextSnapshot: result.contextSnapshot,
        correlation: result.correlation,
        usage: result.usage,
      };
    case 'aborted':
      return {
        status: result.status,
        reason: result.reason,
        correlation: result.correlation,
        usage: result.usage,
      };
    case 'budget_exhausted':
      return {
        status: result.status,
        exhausted: result.exhausted,
        turnsUsed: result.turnsUsed,
        tokensUsed: result.tokensUsed,
        partialState: result.partialState,
        correlation: result.correlation,
        usage: result.usage,
      };
    case 'error':
      return {
        status: result.status,
        reason: result.reason,
        detail: result.detail,
        correlation: result.correlation,
        usage: result.usage,
      };
    case 'suspended':
      return {
        status: result.status,
        reason: result.reason,
        resumeWhen: result.resumeWhen,
        detail: result.detail,
        correlation: result.correlation,
        usage: result.usage,
      };
  }
}
