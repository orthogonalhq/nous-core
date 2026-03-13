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
  type GatewayDispatchRequest,
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
import { parseModelOutput } from '../output-parser.js';
import {
  BudgetTracker,
  estimateBudgetUnits,
  estimateUsageUnits,
} from './budget-tracker.js';
import { CorrelationSequencer } from './correlation-sequencer.js';
import { GatewayInbox } from './inbox.js';
import {
  DISPATCH_AGENT_TOOL_NAME,
  FLAG_OBSERVATION_TOOL_NAME,
  REQUEST_ESCALATION_TOOL_NAME,
  TASK_COMPLETE_TOOL_NAME,
  getLifecycleUnavailableMessage,
  parseDispatchRequest,
  parseEscalationRequest,
  parseObservation,
  parseTaskCompletionRequest,
} from './lifecycle-hooks.js';
import { GatewayOutbox } from './outbox.js';
import { composeSystemPrompt } from './system-prompt-composer.js';

const DEFAULT_MODEL_ROLE: ModelRole = 'reasoner';
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
  request: GatewayDispatchRequest;
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

  constructor(private readonly config: AgentGatewayConfig) {
    this.agentClass = config.agentClass;
    this.agentId = config.agentId;
    this.now = config.now ?? defaultNow;
    this.nowMs = config.nowMs ?? defaultNowMs;
    this.idFactory = config.idFactory ?? randomUUID;
    this.inbox = new GatewayInbox(this.now, this.idFactory);
    this.outbox = new GatewayOutbox(config.outbox);

    if (!config.modelProvider && (!config.modelRouter || !config.getProvider)) {
      throw new NousError(
        'AgentGateway requires modelProvider or modelRouter + getProvider',
        'CONFIG_ERROR',
      );
    }
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
        const systemPrompt = composeSystemPrompt({
          agentClass: this.agentClass,
          taskInstructions: validInput.taskInstructions,
          baseSystemPrompt: this.config.baseSystemPrompt,
          execution: validInput.execution,
          tools,
        });

        const modelResponse = await provider.invoke({
          role: this.config.modelRole ?? DEFAULT_MODEL_ROLE,
          input: { systemPrompt, context, tools },
          projectId,
          traceId,
          agentClass: this.agentClass,
        });

        budgetTracker.recordModelUsage(modelResponse.usage);
        const parsedOutput = parseModelOutput(modelResponse.output, traceId);
        if (parsedOutput.response.trim()) {
          context.push(
            this.createContextFrame('assistant', 'model_output', parsedOutput.response),
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
    budgetTracker: BudgetTracker;
    sequencer: CorrelationSequencer;
    traceId: TraceId;
    projectId?: ProjectId;
    evidenceRefs: TraceEvidenceReference[];
    context: GatewayContextFrame[];
    startedAt: string;
  }): Promise<ToolHandlingResult> {
    switch (args.toolName) {
      case DISPATCH_AGENT_TOOL_NAME:
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
    toolCalls: Array<{ name: string; params: unknown }>;
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
        toolCall.name === DISPATCH_AGENT_TOOL_NAME ? index : -1,
      )
      .filter((index) => index >= 0);

    const dispatchResults =
      dispatchIndexes.length > 1
        ? await this.handleDispatchBatch(args, dispatchIndexes)
        : new Map<number, ToolHandlingResult>();

    for (let index = 0; index < args.toolCalls.length; index += 1) {
      const toolCall = args.toolCalls[index];
      const handled =
        dispatchResults.get(index) ??
        (await this.handleToolCall({
          ...args,
          toolName: toolCall.name,
          params: toolCall.params,
        }));

      if (handled.contextFrame) {
        frameByIndex.set(index, handled.contextFrame);
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
      const prepared = this.prepareDispatchTool(
        {
          ...args,
          toolName: DISPATCH_AGENT_TOOL_NAME,
          params: args.toolCalls[index]!.params,
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
      pending.map(({ prepared }) =>
        this.executePreparedDispatch(
          {
            ...args,
            toolName: DISPATCH_AGENT_TOOL_NAME,
            params: args.toolCalls[0]?.params,
          },
          prepared,
        ),
      ),
    );

    settled.forEach((result, offset) => {
      const index = pending[offset]!.index;
      if (result.status === 'fulfilled') {
        immediate.set(index, result.value);
        return;
      }

      immediate.set(index, {
        contextFrame: this.createContextFrame(
          'tool',
          'tool_error',
          normalizeToolError(DISPATCH_AGENT_TOOL_NAME, result.reason),
          DISPATCH_AGENT_TOOL_NAME,
        ),
      });
    });

    return immediate;
  }

  private async handleStandardTool(args: {
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
    if (!this.config.lifecycleHooks?.dispatchAgent) {
      return {
        immediate: {
          contextFrame: this.createContextFrame(
            'tool',
            'tool_error',
            getLifecycleUnavailableMessage(DISPATCH_AGENT_TOOL_NAME),
            DISPATCH_AGENT_TOOL_NAME,
          ),
        },
      };
    }

    let request: GatewayDispatchRequest;
    try {
      request = parseDispatchRequest(args.params);
    } catch (error) {
      return {
        immediate: {
          contextFrame: this.createContextFrame(
            'tool',
            'tool_error',
            normalizeToolError(DISPATCH_AGENT_TOOL_NAME, error),
            DISPATCH_AGENT_TOOL_NAME,
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
              'Tool dispatch_agent failed: spawn budget exceeded',
              DISPATCH_AGENT_TOOL_NAME,
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

    return { prepared: { request } };
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
      const value = await this.config.lifecycleHooks!.dispatchAgent!(
        prepared.request,
        this.buildLifecycleContext(
          args.sequencer.snapshot(),
          args.budgetTracker,
          args.input,
          args.context.length,
          args.startedAt,
        ),
      );

      args.budgetTracker.consumeSpawnUnits(estimateUsageUnits(value.usage));

      return {
        contextFrame: this.createContextFrame(
          'tool',
          'child_result',
          stringifyValue(projectChildResult(value)),
          DISPATCH_AGENT_TOOL_NAME,
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
            { toolName: DISPATCH_AGENT_TOOL_NAME },
          ),
        };
      }

      return {
        contextFrame: this.createContextFrame(
          'tool',
          'tool_error',
          normalizeToolError(DISPATCH_AGENT_TOOL_NAME, error),
          DISPATCH_AGENT_TOOL_NAME,
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
      this.config.modelRole ?? DEFAULT_MODEL_ROLE,
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
  ): GatewayContextFrame {
    return GatewayContextFrameSchema.parse({
      role,
      source,
      content,
      name,
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
