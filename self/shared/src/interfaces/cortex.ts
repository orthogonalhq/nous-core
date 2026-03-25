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
  ConfidenceGovernanceEvaluationInput,
  ConfidenceGovernanceEvaluationResult,
  MemoryWriteCandidate,
  MemoryMutationRequest,
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
  /** Evaluate a confidence-governance runtime decision bundle */
  evaluateConfidenceGovernance(
    input: ConfidenceGovernanceEvaluationInput,
  ): Promise<ConfidenceGovernanceEvaluationResult>;

  /** Evaluate a memory write candidate — approve or deny */
  evaluateMemoryWrite(
    candidate: MemoryWriteCandidate,
    projectId?: ProjectId,
  ): Promise<PfcDecision>;

  /** Evaluate a governed memory mutation request — approve or deny */
  evaluateMemoryMutation(
    request: MemoryMutationRequest,
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

  /** Determine whether to escalate to the Principal */
  evaluateEscalation(situation: EscalationSituation): Promise<EscalationDecision>;

  /** Get the current Cortex tier */
  getTier(): PfcTier;
}

/**
 * @deprecated Use {@link AgentGateway.run()} for new code.
 * `GatewayBackedTurnExecutor` is the sole implementation and serves as
 * the compatibility bridge for callers still using this interface.
 * This interface will be removed in a future sprint after caller migration.
 */
export interface ICoreExecutor {
  /** @deprecated Use AgentGateway.run() directly. */
  executeTurn(input: TurnInput): Promise<TurnResult>;

  /** @deprecated Use AgentGateway.run() directly. */
  superviseProject(projectId: ProjectId): Promise<void>;

  /** @deprecated Use GatewayTraceRecorder directly. */
  getTrace(traceId: TraceId): Promise<ExecutionTrace | null>;
}
