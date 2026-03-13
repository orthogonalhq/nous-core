import {
  ExecutionTraceSchema,
  type ExecutionTrace,
  type IDocumentStore,
  type PfcDecision,
  type ProjectId,
  type TraceEvidenceReference,
  type TraceId,
} from '@nous/shared';

const TRACE_COLLECTION = 'execution_traces';

export interface GatewayTraceRecordInput {
  traceId: TraceId;
  projectId?: ProjectId;
  startedAt: string;
  completedAt?: string;
  input: string;
  output: string;
  pfcDecisions?: PfcDecision[];
  evidenceRefs?: TraceEvidenceReference[];
}

export class GatewayTraceRecorder {
  constructor(private readonly documentStore: IDocumentStore) {}

  async recordTurn(input: GatewayTraceRecordInput): Promise<ExecutionTrace> {
    const trace = ExecutionTraceSchema.parse({
      traceId: input.traceId,
      projectId: input.projectId,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      turns: [
        {
          input: input.input,
          output: input.output,
          modelCalls: [],
          pfcDecisions: input.pfcDecisions ?? [],
          toolDecisions: [],
          memoryWrites: [],
          memoryDenials: [],
          evidenceRefs: input.evidenceRefs ?? [],
          timestamp: input.startedAt,
        },
      ],
    });

    await this.documentStore.put(TRACE_COLLECTION, input.traceId, trace);
    return trace;
  }

  async getTrace(traceId: TraceId): Promise<ExecutionTrace | null> {
    const raw = await this.documentStore.get<unknown>(TRACE_COLLECTION, traceId);
    if (!raw) {
      return null;
    }

    const parsed = ExecutionTraceSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }
}
