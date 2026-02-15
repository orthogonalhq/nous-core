/**
 * Cortex layer interface contracts.
 *
 * IPfcEngine — the Prefrontal Cortex engine.
 * ICoreExecutor — the central executive loop.
 */
import type {
  ProjectId,
  TraceId,
  PfcTier,
  MemoryWriteCandidate,
  PfcDecision,
  ReflectionContext,
  ReflectionResult,
  EscalationSituation,
  EscalationDecision,
  TurnInput,
  TurnResult,
  ExecutionTrace,
} from '../types/index.js';

export interface IPfcEngine {
  /** Evaluate a memory write candidate — approve or deny */
  evaluateMemoryWrite(
    candidate: MemoryWriteCandidate,
    projectId?: ProjectId,
  ): Promise<PfcDecision>;

  /** Evaluate a tool execution request — authorize or deny */
  evaluateToolExecution(
    toolName: string,
    params: unknown,
    projectId?: ProjectId,
  ): Promise<PfcDecision>;

  /** Reflect on an output — assess confidence and quality */
  reflect(output: unknown, context: ReflectionContext): Promise<ReflectionResult>;

  /** Determine whether to escalate to the human */
  evaluateEscalation(situation: EscalationSituation): Promise<EscalationDecision>;

  /** Get the current PFC tier */
  getTier(): PfcTier;
}

export interface ICoreExecutor {
  /** Execute a single agent turn — input in, response out */
  executeTurn(input: TurnInput): Promise<TurnResult>;

  /** Start or resume a project supervision loop */
  superviseProject(projectId: ProjectId): Promise<void>;

  /** Get the execution trace for a given trace ID */
  getTrace(traceId: TraceId): Promise<ExecutionTrace | null>;
}
