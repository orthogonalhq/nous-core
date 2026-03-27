/**
 * PfcEngine — IPfcEngine implementation.
 *
 * Single-tier Phase 1: basic reflection, memory gating, tool authorization.
 */
import type {
  IPfcEngine,
  IConfig,
  IToolExecutor,
  IThoughtEmitter,
  ConfidenceGovernanceEvaluationInput,
  ConfidenceGovernanceEvaluationResult,
  MemoryWriteCandidate,
  MemoryMutationRequest,
  PfcDecision,
  ReflectionContext,
  ReflectionResult,
  EscalationSituation,
  EscalationDecision,
  PfcTier,
  ProjectId,
} from '@nous/shared';
import {
  observeConfidenceGovernanceDecision,
  evaluateConfidenceGovernanceRuntime,
  type ConfidenceGovernanceObserver,
} from './confidence-governance-runtime.js';

export class PfcEngine implements IPfcEngine {
  private thoughtEmitter?: IThoughtEmitter;

  constructor(
    private readonly config: IConfig,
    private readonly toolExecutor: IToolExecutor,
    private readonly confidenceGovernanceObserver?: ConfidenceGovernanceObserver,
    thoughtEmitter?: IThoughtEmitter,
  ) {
    this.thoughtEmitter = thoughtEmitter;
  }

  setThoughtEmitter(emitter: IThoughtEmitter): void {
    this.thoughtEmitter = emitter;
  }

  async evaluateConfidenceGovernance(
    input: ConfidenceGovernanceEvaluationInput,
  ): Promise<ConfidenceGovernanceEvaluationResult> {
    const decision = evaluateConfidenceGovernanceRuntime(input);
    await observeConfidenceGovernanceDecision(
      decision,
      this.confidenceGovernanceObserver,
    );
    console.info(
      `[nous:pfc] confidence_governance patternId=${decision.patternId} outcome=${decision.outcome} reasonCode=${decision.reasonCode} governance=${decision.governance} tier=${decision.confidenceTier} actionCategory=${decision.actionCategory}`,
    );
    this.thoughtEmitter?.emitPfcDecision({
      traceId: '',
      thoughtType: 'confidence-governance',
      decision: decision.outcome === 'deny' ? 'denied' : 'approved',
      confidence: undefined,
      reason: decision.reasonCode,
      content: `patternId=${decision.patternId} outcome=${decision.outcome} reasonCode=${decision.reasonCode} governance=${decision.governance} tier=${decision.confidenceTier} actionCategory=${decision.actionCategory}`,
      sequence: 0,
      emittedAt: new Date().toISOString(),
    });
    return decision;
  }

  async evaluateMemoryWrite(
    candidate: MemoryWriteCandidate,
    _projectId?: ProjectId,
  ): Promise<PfcDecision> {
    if (candidate.confidence < 0.5) {
      const decision: PfcDecision = {
        approved: false,
        reason: 'MEM-CONFIDENCE-BELOW-THRESHOLD',
        confidence: candidate.confidence,
      };
      console.info(
        `[nous:pfc] memory_write approved=false reason=${decision.reason}`,
      );
      this.thoughtEmitter?.emitPfcDecision({
        traceId: '',
        thoughtType: 'memory-write',
        decision: 'denied',
        confidence: decision.confidence,
        reason: decision.reason,
        content: `approved=false reason=${decision.reason}`,
        sequence: 0,
        emittedAt: new Date().toISOString(),
      });
      return decision;
    }
    const decision: PfcDecision = {
      approved: true,
      reason: 'MEM-WRITE-APPROVED',
      confidence: candidate.confidence,
    };
    console.info(
      `[nous:pfc] memory_write approved=true reason=${decision.reason}`,
    );
    this.thoughtEmitter?.emitPfcDecision({
      traceId: '',
      thoughtType: 'memory-write',
      decision: 'approved',
      confidence: decision.confidence,
      reason: decision.reason,
      content: `approved=true reason=${decision.reason}`,
      sequence: 0,
      emittedAt: new Date().toISOString(),
    });
    return decision;
  }

  async evaluateMemoryMutation(
    request: MemoryMutationRequest,
    _projectId?: ProjectId,
  ): Promise<PfcDecision> {
    if (request.actor === 'core' || request.actor === 'tool') {
      const decision: PfcDecision = {
        approved: false,
        reason: 'MEM-ACTOR-BOUNDARY-BLOCKED',
        confidence: 1,
      };
      this.emitMemoryMutationThought(decision);
      return decision;
    }

    if (request.action === 'hard-delete') {
      const hasOverride = !!request.principalOverride?.rationale;
      if (request.actor !== 'principal' && !hasOverride) {
        const decision: PfcDecision = {
          approved: false,
          reason: 'MEM-HARD-DELETE-REQUIRES-OVERRIDE',
          confidence: 1,
        };
        this.emitMemoryMutationThought(decision);
        return decision;
      }
    }

    if (request.action === 'create' || request.action === 'supersede') {
      if (!request.replacementCandidate) {
        const decision: PfcDecision = {
          approved: false,
          reason: 'MEM-REPLACEMENT-CANDIDATE-REQUIRED',
          confidence: 1,
        };
        this.emitMemoryMutationThought(decision);
        return decision;
      }
      if (request.replacementCandidate.confidence < 0.5) {
        const decision: PfcDecision = {
          approved: false,
          reason: 'MEM-CONFIDENCE-BELOW-THRESHOLD',
          confidence: request.replacementCandidate.confidence,
        };
        this.emitMemoryMutationThought(decision);
        return decision;
      }
    }

    if (
      (request.action === 'soft-delete' || request.action === 'hard-delete') &&
      !request.targetEntryId
    ) {
      const decision: PfcDecision = {
        approved: false,
        reason: 'MEM-TARGET-REQUIRED',
        confidence: 1,
      };
      this.emitMemoryMutationThought(decision);
      return decision;
    }

    if (
      (request.action === 'promote-global' ||
        request.action === 'demote-project' ||
        request.action === 'compact-stm') &&
      !request.projectId
    ) {
      const decision: PfcDecision = {
        approved: false,
        reason: 'MEM-PROJECT-REQUIRED',
        confidence: 1,
      };
      this.emitMemoryMutationThought(decision);
      return decision;
    }

    const decision: PfcDecision = {
      approved: true,
      reason: 'MEM-MUTATION-APPROVED',
      confidence: 1,
    };
    this.emitMemoryMutationThought(decision);
    return decision;
  }

  private emitMemoryMutationThought(decision: PfcDecision): void {
    this.thoughtEmitter?.emitPfcDecision({
      traceId: '',
      thoughtType: 'memory-mutation',
      decision: decision.approved ? 'approved' : 'denied',
      confidence: decision.confidence,
      reason: decision.reason,
      content: `approved=${decision.approved} reason=${decision.reason}`,
      sequence: 0,
      emittedAt: new Date().toISOString(),
    });
  }

  async evaluateToolExecution(
    toolName: string,
    _params: unknown,
    _projectId?: ProjectId,
  ): Promise<PfcDecision> {
    const tools = await this.toolExecutor.listTools();
    const found = tools.some((t) => t.name === toolName);
    if (!found) {
      const decision: PfcDecision = {
        approved: false,
        reason: 'tool not registered',
        confidence: 0,
      };
      console.info(
        `[nous:pfc] tool_auth toolName=${toolName} approved=false reason=${decision.reason}`,
      );
      this.thoughtEmitter?.emitPfcDecision({
        traceId: '',
        thoughtType: 'tool-execution',
        decision: 'denied',
        confidence: decision.confidence,
        reason: decision.reason,
        content: `toolName=${toolName} approved=false reason=${decision.reason}`,
        sequence: 0,
        emittedAt: new Date().toISOString(),
      });
      return decision;
    }
    const decision: PfcDecision = {
      approved: true,
      reason: 'passed Phase 1 checks',
      confidence: 1,
    };
    console.info(
      `[nous:pfc] tool_auth toolName=${toolName} approved=true reason=${decision.reason}`,
    );
    this.thoughtEmitter?.emitPfcDecision({
      traceId: '',
      thoughtType: 'tool-execution',
      decision: 'approved',
      confidence: decision.confidence,
      reason: decision.reason,
      content: `toolName=${toolName} approved=true reason=${decision.reason}`,
      sequence: 0,
      emittedAt: new Date().toISOString(),
    });
    return decision;
  }

  async reflect(
    _output: unknown,
    _context: ReflectionContext,
  ): Promise<ReflectionResult> {
    console.debug('[nous:pfc] reflect confidence=0.8 qualityScore=0.8');
    this.thoughtEmitter?.emitPfcDecision({
      traceId: '',
      thoughtType: 'reflection',
      decision: 'neutral',
      confidence: 0.8,
      reason: 'reflection-complete',
      content: 'confidence=0.8 qualityScore=0.8',
      sequence: 0,
      emittedAt: new Date().toISOString(),
    });
    return {
      confidence: 0.8,
      qualityScore: 0.8,
      flags: [],
      shouldEscalate: false,
    };
  }

  async evaluateEscalation(
    situation: EscalationSituation,
  ): Promise<EscalationDecision> {
    if (situation.confidence < 0.3) {
      console.info(
        `[nous:pfc] escalation trigger=${situation.trigger} context=${situation.context}`,
      );
      this.thoughtEmitter?.emitPfcDecision({
        traceId: '',
        thoughtType: 'escalation',
        decision: 'neutral',
        confidence: situation.confidence,
        reason: 'low confidence',
        content: `trigger=${situation.trigger} context=${situation.context}`,
        sequence: 0,
        emittedAt: new Date().toISOString(),
      });
      return {
        shouldEscalate: true,
        reason: 'low confidence',
      };
    }
    this.thoughtEmitter?.emitPfcDecision({
      traceId: '',
      thoughtType: 'escalation',
      decision: 'neutral',
      confidence: situation.confidence,
      reason: 'confidence sufficient',
      content: `trigger=${situation.trigger} context=${situation.context} shouldEscalate=false`,
      sequence: 0,
      emittedAt: new Date().toISOString(),
    });
    return {
      shouldEscalate: false,
      reason: 'confidence sufficient',
    };
  }

  getTier(): PfcTier {
    const cfg = this.config.get();
    const tier = cfg.pfcTier;
    if (typeof tier === 'number' && tier >= 0 && tier <= 5) {
      return tier as PfcTier;
    }
    return 3;
  }
}
