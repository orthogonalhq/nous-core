/**
 * PfcEngine — IPfcEngine implementation.
 *
 * Single-tier Phase 1: basic reflection, memory gating, tool authorization.
 */
import type {
  IPfcEngine,
  IConfig,
  IToolExecutor,
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

export class PfcEngine implements IPfcEngine {
  constructor(
    private readonly config: IConfig,
    private readonly toolExecutor: IToolExecutor,
  ) {}

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
    return decision;
  }

  async evaluateMemoryMutation(
    request: MemoryMutationRequest,
    _projectId?: ProjectId,
  ): Promise<PfcDecision> {
    if (request.actor === 'core' || request.actor === 'tool') {
      return {
        approved: false,
        reason: 'MEM-ACTOR-BOUNDARY-BLOCKED',
        confidence: 1,
      };
    }

    if (request.action === 'hard-delete') {
      const hasOverride = !!request.principalOverride?.rationale;
      if (request.actor !== 'principal' && !hasOverride) {
        return {
          approved: false,
          reason: 'MEM-HARD-DELETE-REQUIRES-OVERRIDE',
          confidence: 1,
        };
      }
    }

    if (request.action === 'create' || request.action === 'supersede') {
      if (!request.replacementCandidate) {
        return {
          approved: false,
          reason: 'MEM-REPLACEMENT-CANDIDATE-REQUIRED',
          confidence: 1,
        };
      }
      if (request.replacementCandidate.confidence < 0.5) {
        return {
          approved: false,
          reason: 'MEM-CONFIDENCE-BELOW-THRESHOLD',
          confidence: request.replacementCandidate.confidence,
        };
      }
    }

    if (
      (request.action === 'soft-delete' || request.action === 'hard-delete') &&
      !request.targetEntryId
    ) {
      return {
        approved: false,
        reason: 'MEM-TARGET-REQUIRED',
        confidence: 1,
      };
    }

    if (
      (request.action === 'promote-global' ||
        request.action === 'demote-project' ||
        request.action === 'compact-stm') &&
      !request.projectId
    ) {
      return {
        approved: false,
        reason: 'MEM-PROJECT-REQUIRED',
        confidence: 1,
      };
    }

    return {
      approved: true,
      reason: 'MEM-MUTATION-APPROVED',
      confidence: 1,
    };
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
    return decision;
  }

  async reflect(
    _output: unknown,
    _context: ReflectionContext,
  ): Promise<ReflectionResult> {
    console.debug('[nous:pfc] reflect confidence=0.8 qualityScore=0.8');
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
      return {
        shouldEscalate: true,
        reason: 'low confidence',
      };
    }
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
