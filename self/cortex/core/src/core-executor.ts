/**
 * CoreExecutor — ICoreExecutor implementation.
 *
 * 10-step single-turn cycle: input → context → PFC → model → PFC validate →
 * tool auth → memory candidates → PFC gate → response → trace.
 */
import { NousError, ValidationError } from '@nous/shared';
import {
  TurnInputSchema,
  ExecutionTraceSchema,
  type ICoreExecutor,
  type IPfcEngine,
  type IModelRouter,
  type IModelProvider,
  type IToolExecutor,
  type IStmStore,
  type IProjectStore,
  type IDocumentStore,
  type MemoryWriteCandidate,
  type MemoryEntryId,
  type ProjectId,
  type ProviderId,
  type TraceId,
  type ModelRole,
  type ExecutionTrace,
  type TurnResult,
  type PfcDecision,
  type StmContext,
} from '@nous/shared';
import { parseModelOutput } from './output-parser.js';

const TRACE_COLLECTION = 'execution_traces';
const DEFAULT_MODEL_ROLE: ModelRole = 'reasoner';

export interface MwcPipelineLike {
  submit(
    candidate: MemoryWriteCandidate,
    projectId?: ProjectId,
  ): Promise<MemoryEntryId | null>;
}

export interface CoreExecutorDeps {
  pfc: IPfcEngine;
  router: IModelRouter;
  getProvider: (id: ProviderId) => IModelProvider | null;
  toolExecutor: IToolExecutor;
  stmStore: IStmStore;
  mwcPipeline: MwcPipelineLike;
  projectStore: IProjectStore;
  documentStore: IDocumentStore;
}

export class CoreExecutor implements ICoreExecutor {
  constructor(private readonly deps: CoreExecutorDeps) {}

  async executeTurn(input: TurnInput): Promise<TurnResult> {
    const parsed = TurnInputSchema.safeParse(input);
    if (!parsed.success) {
      const errors = parsed.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError('Invalid TurnInput', errors);
    }
    const validInput = parsed.data;

    const startedAt = new Date().toISOString();
    const projectId = validInput.projectId;
    const traceId = validInput.traceId;

    console.debug(
      `[nous:core] turn_start traceId=${traceId} projectId=${projectId ?? 'none'}`,
    );

    const turnData: TurnData = {
      input: validInput.message,
      output: '',
      modelCalls: [],
      pfcDecisions: [],
      toolDecisions: [],
      memoryWrites: [],
      memoryDenials: [],
      timestamp: startedAt,
    };

    try {
      // Step 2: Context
      const stmContext: StmContext = validInput.stmContext ?? (projectId
        ? await this.deps.stmStore.getContext(projectId)
        : { entries: [], tokenCount: 0 });
      const _projectConfig = projectId
        ? await this.deps.projectStore.get(projectId)
        : null;
      const modelRole = DEFAULT_MODEL_ROLE;
      const prompt = buildPrompt(validInput.message, stmContext);

      // Step 4: Model
      const providerId = await this.deps.router.route(modelRole, projectId);
      const provider = this.deps.getProvider(providerId);
      if (!provider) {
        throw new NousError(
          `Provider ${providerId} not found`,
          'PROVIDER_NOT_FOUND',
        );
      }

      const modelStart = Date.now();
      const response = await provider.invoke({
        role: modelRole,
        input: { prompt },
        projectId,
        traceId,
      });
      const durationMs = Date.now() - modelStart;

      console.debug(
        `[nous:core] model_call providerId=${providerId} role=${modelRole}`,
      );

      turnData.modelCalls.push({
        providerId,
        role: modelRole,
        inputTokens: response.usage?.inputTokens,
        outputTokens: response.usage?.outputTokens,
        durationMs,
      });

      // Step 5: PFC reflect
      const reflection = await this.deps.pfc.reflect(response.output, {
        output: response.output,
        projectId,
        traceId,
        tier: this.deps.pfc.getTier(),
      });
      turnData.pfcDecisions.push({
        approved: !reflection.shouldEscalate,
        reason: reflection.notes ?? 'reflection',
        confidence: reflection.confidence,
      });

      // Step 6–9: Parse, tools, memory
      const parsed = parseModelOutput(
        response.output,
        traceId,
        validInput.message,
      );
      turnData.output = parsed.response;

      for (const tc of parsed.toolCalls) {
        const decision = await this.deps.pfc.evaluateToolExecution(
          tc.name,
          tc.params,
          projectId,
        );
        turnData.toolDecisions.push({
          toolName: tc.name,
          approved: decision.approved,
          reason: decision.reason,
        });
        if (decision.approved) {
          await this.deps.toolExecutor.execute(tc.name, tc.params, projectId);
        }
      }

      for (const candidate of parsed.memoryCandidates) {
        const decision = await this.deps.pfc.evaluateMemoryWrite(
          candidate,
          projectId,
        );
        if (decision.approved) {
          try {
            const id = await this.deps.mwcPipeline.submit(candidate, projectId);
            if (id) {
              turnData.memoryWrites.push(id);
            } else {
              turnData.memoryDenials.push({
                candidate,
                reason: decision.reason,
              });
            }
          } catch {
            turnData.memoryDenials.push({
              candidate,
              reason: 'MwcPipeline.submit failed',
            });
          }
        } else {
          turnData.memoryDenials.push({
            candidate,
            reason: decision.reason,
          });
        }
      }
    } catch (err) {
      turnData.output = `[error: ${err instanceof Error ? err.message : String(err)}]`;
      console.info(
        `[nous:core] turn_complete traceId=${traceId} error=${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const completedAt = new Date().toISOString();
    console.info(`[nous:core] turn_complete traceId=${traceId}`);

    const trace: ExecutionTrace = {
      traceId,
      projectId,
      startedAt,
      completedAt,
      turns: [turnData],
    };

    const traceValid = ExecutionTraceSchema.safeParse(trace);
    if (traceValid.success) {
      try {
        await this.deps.documentStore.put(
          TRACE_COLLECTION,
          traceId,
          traceValid.data,
        );
        console.info(`[nous:core] trace_persisted traceId=${traceId}`);
      } catch (e) {
        console.error(
          `[nous:core] trace persist failed traceId=${traceId}`,
          e,
        );
      }
    }

    return {
      response: turnData.output,
      traceId,
      memoryCandidates: [],
      pfcDecisions: turnData.pfcDecisions,
    };
  }

  async superviseProject(_projectId: ProjectId): Promise<void> {
    throw new NousError(
      'superviseProject not implemented (Phase 5)',
      'NOT_IMPLEMENTED',
    );
  }

  async getTrace(traceId: TraceId): Promise<ExecutionTrace | null> {
    const raw = await this.deps.documentStore.get<unknown>(
      TRACE_COLLECTION,
      traceId,
    );
    if (!raw) return null;
    const parsed = ExecutionTraceSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }
}

interface TurnData {
  input: string;
  output: string;
  modelCalls: Array<{
    providerId: ProviderId;
    role: string;
    inputTokens?: number;
    outputTokens?: number;
    durationMs?: number;
  }>;
  pfcDecisions: PfcDecision[];
  toolDecisions: Array<{ toolName: string; approved: boolean; reason?: string }>;
  memoryWrites: MemoryEntryId[];
  memoryDenials: Array<{ candidate: MemoryWriteCandidate; reason: string }>;
  timestamp: string;
}

type TurnInput = Parameters<ICoreExecutor['executeTurn']>[0];

function buildPrompt(message: string, stmContext: StmContext): string {
  const parts: string[] = [];
  for (const e of stmContext.entries ?? []) {
    parts.push(`${e.role}: ${e.content}`);
  }
  parts.push(`User: ${message}`);
  parts.push('Assistant:');
  return parts.join('\n\n');
}
