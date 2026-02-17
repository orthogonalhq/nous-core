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
        reason: 'confidence below threshold',
        confidence: candidate.confidence,
      };
      console.info(
        `[nous:pfc] memory_write approved=false reason=${decision.reason}`,
      );
      return decision;
    }
    const decision: PfcDecision = {
      approved: true,
      reason: 'passed Phase 1 checks',
      confidence: candidate.confidence,
    };
    console.info(
      `[nous:pfc] memory_write approved=true reason=${decision.reason}`,
    );
    return decision;
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
