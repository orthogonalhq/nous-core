import { randomUUID } from 'node:crypto';
import {
  GatewayContextFrameSchema,
  NousError,
  TurnInputSchema,
  type AgentGatewayConfig,
  type IAgentGatewayFactory,
  type ICoreExecutor,
  type IDocumentStore,
  type IEscalationService,
  type IModelProvider,
  type IModelRouter,
  type IOpctlService,
  type IProjectApi,
  type IProjectStore,
  type IRuntime,
  type IScheduler,
  type IStmStore,
  type IToolExecutor,
  type IWorkflowEngine,
  type IWitnessService,
  type ProjectId,
  type ProviderId,
  type StmContext,
  type MemoryWriteCandidate,
  type MemoryMutationRequest,
  type MemoryEntryId,
  type TraceEvidenceReference,
  type TraceId,
  type TurnResult,
} from '@nous/shared';
import { AgentGatewayFactory } from '../agent-gateway/index.js';
import { createInternalMcpSurfaceBundle } from '../internal-mcp/index.js';
import type { InternalMcpOutputSchemaValidator } from '../internal-mcp/types.js';
import { parseModelOutput } from '../output-parser.js';
import { GatewayTraceRecorder } from './trace-recorder.js';

const DEFAULT_CHAT_BUDGET = {
  maxTurns: 4,
  maxTokens: 1200,
  timeoutMs: 120_000,
} as const;

const CHAT_COMPLETION_SCHEMA_REF = 'schema://chat-response';

type GatewayInputRecord = {
  systemPrompt: string;
  context: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isGatewayInput(value: unknown): value is GatewayInputRecord {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.systemPrompt === 'string' && Array.isArray(value.context);
}

export function transformGatewayInput(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  if ('messages' in input || 'prompt' in input) {
    return input;
  }

  if (!isGatewayInput(input)) {
    return input;
  }

  const parsedContext = GatewayContextFrameSchema.array().safeParse(input.context);
  if (!parsedContext.success) {
    return input;
  }

  return {
    messages: [
      {
        role: 'system' as const,
        content: input.systemPrompt,
      },
      ...parsedContext.data.map((frame) => ({
        role: frame.role === 'tool' ? 'user' as const : frame.role,
        content: frame.content,
      })),
    ],
  };
}

interface MwcPipelineLike {
  submit(
    candidate: MemoryWriteCandidate,
    projectId?: ProjectId,
  ): Promise<MemoryEntryId | null>;
  mutate(
    request: MemoryMutationRequest,
    projectId?: ProjectId,
  ): Promise<{ applied: boolean; reason: string; reasonCode: string }>;
}

export interface GatewayBackedTurnExecutorDeps {
  modelRouter: IModelRouter;
  getProvider: (providerId: ProviderId) => IModelProvider | null;
  documentStore: IDocumentStore;
  stmStore: IStmStore;
  mwcPipeline: MwcPipelineLike;
  getProjectApi?: (projectId: ProjectId) => IProjectApi | null;
  toolExecutor?: IToolExecutor;
  workflowEngine?: IWorkflowEngine;
  projectStore?: IProjectStore;
  scheduler?: IScheduler;
  escalationService?: IEscalationService;
  witnessService?: IWitnessService;
  opctlService?: IOpctlService;
  runtime?: IRuntime;
  instanceRoot?: string;
  outputSchemaValidator?: InternalMcpOutputSchemaValidator;
  agentGatewayFactory?: IAgentGatewayFactory;
  now?: () => string;
  nowMs?: () => number;
  idFactory?: () => string;
}

export class GatewayBackedTurnExecutor implements ICoreExecutor {
  private readonly gatewayFactory: IAgentGatewayFactory;
  private readonly traceRecorder: GatewayTraceRecorder;
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(private readonly deps: GatewayBackedTurnExecutorDeps) {
    this.gatewayFactory = deps.agentGatewayFactory ?? new AgentGatewayFactory();
    this.traceRecorder = new GatewayTraceRecorder(deps.documentStore);
    this.now = deps.now ?? (() => new Date().toISOString());
    this.idFactory = deps.idFactory ?? randomUUID;
  }

  async executeTurn(input: Parameters<ICoreExecutor['executeTurn']>[0]): Promise<TurnResult> {
    const parsed = TurnInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new NousError('Invalid TurnInput', 'VALIDATION_ERROR', {
        issues: parsed.error.issues,
      });
    }

    const validInput = parsed.data;
    const startedAt = this.now();

    if (validInput.projectId && this.deps.opctlService) {
      const controlState = await this.deps.opctlService.getProjectControlState(
        validInput.projectId,
      );
      if (controlState === 'paused_review' || controlState === 'hard_stopped') {
        return {
          response: `[Project blocked by operator control (${controlState}).]`,
          traceId: validInput.traceId,
          memoryCandidates: [],
          pfcDecisions: [],
        };
      }
    }

    const stmContext = validInput.stmContext ?? (validInput.projectId
      ? await this.deps.stmStore.getContext(validInput.projectId)
      : { entries: [], tokenCount: 0 });

    const gateway = this.createGateway(validInput.message);
    const result = await gateway.run({
      taskInstructions: [
        'Handle the current user chat turn.',
        'Return a concise assistant response.',
        'Complete by calling task_complete with output { "response": "<final reply>" }.',
      ].join('\n'),
      payload: {
        message: validInput.message,
      },
      context: this.buildContextFrames(stmContext),
      budget: DEFAULT_CHAT_BUDGET,
      spawnBudgetCeiling: 0,
      correlation: {
        runId: this.idFactory() as never,
        parentId: gateway.agentId,
        sequence: 0,
      },
      execution: {
        projectId: validInput.projectId,
        traceId: validInput.traceId,
        workmodeId: 'system:implementation',
      },
      modelRequirements: validInput.modelRequirements,
    });

    const response = this.resolveResponse(result);
    const pfcDecisions =
      result.status === 'completed'
        ? []
        : [
            {
              approved: false,
              reason: `gateway_${result.status}`,
              confidence: 1,
            },
          ];

    await this.finalizeStmTurn(
      validInput.projectId,
      validInput.message,
      response,
      validInput.traceId,
      result.evidenceRefs,
    );

    await this.traceRecorder.recordTurn({
      traceId: validInput.traceId,
      projectId: validInput.projectId,
      startedAt,
      completedAt: this.now(),
      input: validInput.message,
      output: response,
      pfcDecisions,
      evidenceRefs: result.evidenceRefs,
    });

    return {
      response,
      traceId: validInput.traceId,
      memoryCandidates: [],
      pfcDecisions,
    };
  }

  async superviseProject(): Promise<void> {
    throw new NousError(
      'superviseProject not implemented for GatewayBackedTurnExecutor',
      'NOT_IMPLEMENTED',
    );
  }

  async getTrace(traceId: TraceId) {
    return this.traceRecorder.getTrace(traceId);
  }

  private createGateway(userMessage: string) {
    const agentId = this.idFactory() as AgentGatewayConfig['agentId'];
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: 'Worker',
      agentId,
      deps: {
        getProjectApi: this.deps.getProjectApi,
        toolExecutor: this.deps.toolExecutor,
        workflowEngine: this.deps.workflowEngine,
        projectStore: this.deps.projectStore,
        scheduler: this.deps.scheduler,
        escalationService: this.deps.escalationService,
        witnessService: this.deps.witnessService,
        opctlService: this.deps.opctlService,
        runtime: this.deps.runtime,
        instanceRoot: this.deps.instanceRoot,
        outputSchemaValidator: this.deps.outputSchemaValidator,
        now: this.now,
        idFactory: this.idFactory,
      },
    });

    return this.gatewayFactory.create({
      agentClass: 'Worker',
      agentId,
      toolSurface: bundle.toolSurface,
      lifecycleHooks: bundle.lifecycleHooks,
      baseSystemPrompt: [
        'You are Worker.',
        'You are the gateway-backed compatibility executor for direct chat turns.',
        'You cannot dispatch child agents.',
        'Always finish with task_complete.',
      ].join('\n'),
      modelRouter: this.deps.modelRouter,
      getProvider: (providerId) =>
        this.wrapProvider(this.deps.getProvider(providerId as ProviderId), userMessage),
      witnessService: this.deps.witnessService,
      now: this.now,
      nowMs: this.deps.nowMs,
      idFactory: this.idFactory,
    });
  }

  private wrapProvider(
    provider: IModelProvider | null,
    fallbackInput: string,
  ): IModelProvider | null {
    if (!provider) {
      return null;
    }

    return {
      ...provider,
      invoke: async (request) => {
        const response = await provider.invoke({
          ...request,
          input: transformGatewayInput(request.input),
        });
        const parsedOutput = parseModelOutput(
          response.output,
          response.traceId,
          fallbackInput,
        );

        if (parsedOutput.toolCalls.some((toolCall) => toolCall.name === 'task_complete')) {
          return response;
        }

        const finalResponse = parsedOutput.response.trim() || String(response.output ?? '');
        return {
          ...response,
          output: JSON.stringify({
            response: '',
            toolCalls: [
              {
                name: 'task_complete',
                params: {
                  output: { response: finalResponse },
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

  private buildContextFrames(stmContext: StmContext) {
    const frames = [];
    if (stmContext.summary) {
      frames.push(
        GatewayContextFrameSchema.parse({
          role: 'system',
          source: 'initial_context',
          content: `Summary: ${stmContext.summary}`,
          createdAt: this.now(),
        }),
      );
    }

    for (const entry of stmContext.entries ?? []) {
      frames.push(
        GatewayContextFrameSchema.parse({
          role: entry.role,
          source: 'initial_context',
          content: entry.content,
          createdAt: entry.timestamp,
        }),
      );
    }

    return frames;
  }

  private resolveResponse(
    result: Awaited<ReturnType<ReturnType<GatewayBackedTurnExecutor['createGateway']>['run']>>,
  ): string {
    if (result.status === 'completed') {
      const output = result.output as { response?: unknown } | string;
      if (typeof output === 'string') {
        return output;
      }
      if (typeof output?.response === 'string') {
        return output.response;
      }
      return JSON.stringify(output);
    }

    if (result.status === 'escalated') {
      return `[escalated: ${result.reason}]`;
    }
    if (result.status === 'budget_exhausted') {
      return '[budget exhausted]';
    }
    if (result.status === 'aborted') {
      return `[aborted: ${result.reason}]`;
    }
    if (result.status === 'suspended') {
      return `[suspended: ${result.reason}]`;
    }
    return `[error: ${result.reason}]`;
  }

  private async finalizeStmTurn(
    projectId: ProjectId | undefined,
    userMessage: string,
    assistantResponse: string,
    traceId: TraceId,
    evidenceRefs: TraceEvidenceReference[],
  ): Promise<void> {
    if (!projectId) {
      return;
    }

    const timestamp = this.now();
    try {
      await this.deps.stmStore.append(projectId, {
        role: 'user',
        content: userMessage,
        timestamp,
      });
      await this.deps.stmStore.append(projectId, {
        role: 'assistant',
        content: assistantResponse,
        timestamp,
      });

      const stmContext = await this.deps.stmStore.getContext(projectId);
      if (!stmContext.compactionState?.requiresCompaction) {
        return;
      }

      await this.deps.mwcPipeline.mutate({
        action: 'compact-stm',
        actor: 'pfc',
        projectId,
        reason: 'Automatic STM compaction due to token threshold',
        traceId,
        evidenceRefs,
      });
    } catch {
      // Preserve chat-path availability even if STM finalization fails.
    }
  }
}

export const GATEWAY_CHAT_COMPLETION_SCHEMA_REF = CHAT_COMPLETION_SCHEMA_REF;
