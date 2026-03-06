import {
  SkillAdmissionDecisionInputSchema,
  SkillAdmissionRequestSchema,
  SkillAdmissionResultSchema,
  SkillAttributionThesisRequestSchema,
  SkillAttributionThesisResultSchema,
  SkillBenchEvaluationRequestSchema,
  SkillBenchEvaluationResultSchema,
  SkillContractValidationRequestSchema,
  SkillContractValidationResultSchema,
  type ISkillAdmissionOrchestrator,
  type SkillAdmissionDecision,
  type SkillAdmissionDecisionInput,
  type SkillAdmissionDecisionRecord,
  type SkillAdmissionEventType,
  type SkillAdmissionReasonCode,
  type SkillAdmissionRequest,
  type SkillAdmissionResult,
  type SkillAttributionThesisRequest,
  type SkillAttributionThesisResult,
  type SkillBenchEvaluationRequest,
  type SkillBenchEvaluationResult,
  type SkillContractValidationRequest,
  type SkillContractValidationResult,
} from '@nous/shared';
import {
  InMemorySkillAdmissionEvidenceEmitter,
  type SkillAdmissionEvidenceEmitter,
} from './evidence-emitter.js';
import {
  InMemorySkillAdmissionStateStore,
  SkillAdmissionStateConflictError,
} from './state-store.js';
import {
  evaluateAdmissionRequest,
  evaluateAttributionThesis,
  evaluateSkillBench,
  evaluateSkillContract,
} from './validator.js';

const defaultNow = (): Date => new Date();

const buildEvidenceRefs = (eventType: string, witnessRef: string): string[] => [
  `event:${eventType}`,
  `witness:${witnessRef}`,
];

const resolveWitnessRef = (witnessRef: string | undefined): string =>
  witnessRef && witnessRef.length > 0 ? witnessRef : 'missing-witness';

const isMissingWitness = (witnessRef: string | undefined): boolean =>
  !witnessRef || witnessRef.length === 0;

const mapDecisionToEventType = (
  decision: SkillAdmissionDecision,
): SkillAdmissionEventType => {
  switch (decision) {
    case 'pending_cortex':
      return 'skill_admission_requested';
    case 'admitted':
      return 'skill_admitted';
    case 'blocked':
      return 'skill_admission_blocked';
    case 'promoted':
      return 'skill_promoted';
    case 'held':
      return 'skill_held';
    case 'rolled_back':
      return 'skill_rolled_back';
    default: {
      const exhaustiveCheck: never = decision;
      throw new Error(`Unhandled decision event mapping: ${exhaustiveCheck}`);
    }
  }
};

interface PersistedResultInput {
  skillId: string;
  revisionId: string;
  decision: SkillAdmissionDecision;
  decidedBy: 'nous_cortex' | 'orchestration_agent' | 'worker_agent';
  reasonCode?: SkillAdmissionReasonCode;
  witnessRef: string;
  benchmarkEvidenceRef?: string;
  attributionThesisRef?: string;
  expectedVersion?: number;
}

export interface SkillAdmissionOrchestratorOptions {
  stateStore?: InMemorySkillAdmissionStateStore;
  evidenceEmitter?: SkillAdmissionEvidenceEmitter;
  now?: () => Date;
}

export class SkillAdmissionOrchestrator implements ISkillAdmissionOrchestrator {
  private readonly stateStore: InMemorySkillAdmissionStateStore;
  private readonly evidenceEmitter: SkillAdmissionEvidenceEmitter;
  private readonly now: () => Date;

  constructor(options: SkillAdmissionOrchestratorOptions = {}) {
    this.stateStore = options.stateStore ?? new InMemorySkillAdmissionStateStore();
    this.evidenceEmitter =
      options.evidenceEmitter ?? new InMemorySkillAdmissionEvidenceEmitter();
    this.now = options.now ?? defaultNow;
  }

  async validateSkillContract(
    input: SkillContractValidationRequest,
  ): Promise<SkillContractValidationResult> {
    const parsed = SkillContractValidationRequestSchema.safeParse(input);
    if (!parsed.success) {
      const witnessRef = resolveWitnessRef(undefined);
      return SkillContractValidationResultSchema.parse({
        skill_id: input.skill_id ?? 'unknown-skill',
        revision_id: input.revision_id ?? 'unknown-revision',
        passed: false,
        violations: [
          {
            code: 'SKADM-003-INVALID-REQUEST',
            detail: 'Skill contract validation request schema parsing failed.',
            evidence_refs: ['schema:skill-contract-validation-request'],
          },
        ],
        witness_ref: witnessRef,
        evidence_refs: buildEvidenceRefs('skill_contract_validation_failed', witnessRef),
      });
    }

    const request = parsed.data;
    const violations = evaluateSkillContract(request);
    const passed = violations.length === 0;
    const eventType = passed
      ? 'skill_contract_validation_passed'
      : 'skill_contract_validation_failed';

    const event = await this.evidenceEmitter.emit({
      event_type: eventType,
      skill_id: request.skill_id,
      revision_id: request.revision_id,
      ...(passed ? {} : { reason_code: violations[0]?.code }),
      evidence_refs: passed
        ? ['contract:skill-runtime-artifact']
        : violations.flatMap((item) => item.evidence_refs),
    });

    const missingWitness = isMissingWitness(event.witness_ref);
    const witnessRef = resolveWitnessRef(event.witness_ref);

    return SkillContractValidationResultSchema.parse({
      skill_id: request.skill_id,
      revision_id: request.revision_id,
      passed: passed && !missingWitness,
      violations: missingWitness
        ? [
            {
              code: 'EVID-001-MISSING-WITNESS',
              detail: 'Validation event did not include witness linkage.',
              evidence_refs: ['event:skill_contract_validation_failed'],
            },
          ]
        : violations,
      witness_ref: witnessRef,
      evidence_refs: buildEvidenceRefs(eventType, witnessRef),
    });
  }

  async evaluateSkillBench(
    input: SkillBenchEvaluationRequest,
  ): Promise<SkillBenchEvaluationResult> {
    const parsed = SkillBenchEvaluationRequestSchema.safeParse(input);
    if (!parsed.success) {
      const witnessRef = resolveWitnessRef(undefined);
      return SkillBenchEvaluationResultSchema.parse({
        skill_id: input.skill_id ?? 'unknown-skill',
        revision_id: input.revision_id ?? 'unknown-revision',
        passed: false,
        drift_detected: false,
        reason_code: 'SKADM-003-INVALID-REQUEST',
        witness_ref: witnessRef,
        evidence_refs: buildEvidenceRefs('skill_bench_run_invalidated', witnessRef),
        benchmark_evidence: input.evidence,
      });
    }

    const request = parsed.data;
    await this.evidenceEmitter.emit({
      event_type: 'skill_bench_run_started',
      skill_id: request.skill_id,
      revision_id: request.revision_id,
      evidence_refs: ['bench:run-started'],
    });

    const reasonCode = evaluateSkillBench(request);
    const passed = reasonCode === null;
    const eventType = passed
      ? 'skill_bench_run_completed'
      : 'skill_bench_run_invalidated';

    const event = await this.evidenceEmitter.emit({
      event_type: eventType,
      skill_id: request.skill_id,
      revision_id: request.revision_id,
      ...(reasonCode ? { reason_code: reasonCode } : {}),
      evidence_refs: request.evidence.run_record_refs,
    });

    const missingWitness = isMissingWitness(event.witness_ref);
    const witnessRef = resolveWitnessRef(event.witness_ref);
    const finalReason = missingWitness
      ? 'EVID-001-MISSING-WITNESS'
      : reasonCode ?? undefined;

    return SkillBenchEvaluationResultSchema.parse({
      skill_id: request.skill_id,
      revision_id: request.revision_id,
      passed: passed && !missingWitness,
      drift_detected: request.evidence.drift_detected,
      ...(finalReason ? { reason_code: finalReason } : {}),
      witness_ref: witnessRef,
      evidence_refs: buildEvidenceRefs(eventType, witnessRef),
      benchmark_evidence: request.evidence,
    });
  }

  async evaluateAttributionThesis(
    input: SkillAttributionThesisRequest,
  ): Promise<SkillAttributionThesisResult> {
    const parsed = SkillAttributionThesisRequestSchema.safeParse(input);
    if (!parsed.success) {
      const witnessRef = resolveWitnessRef(undefined);
      return SkillAttributionThesisResultSchema.parse({
        skill_id: input.skill_id ?? 'unknown-skill',
        revision_id: input.revision_id ?? 'unknown-revision',
        passed: false,
        thesis: input.thesis,
        reason_code: 'SKADM-003-INVALID-REQUEST',
        witness_ref: witnessRef,
        evidence_refs: buildEvidenceRefs(
          'skill_attribution_thesis_generated',
          witnessRef,
        ),
      });
    }

    const request = parsed.data;
    const reasonCode = evaluateAttributionThesis(request);
    const event = await this.evidenceEmitter.emit({
      event_type: 'skill_attribution_thesis_generated',
      skill_id: request.skill_id,
      revision_id: request.revision_id,
      ...(reasonCode ? { reason_code: reasonCode } : {}),
      evidence_refs: request.thesis.evidence_refs,
    });

    const missingWitness = isMissingWitness(event.witness_ref);
    const witnessRef = resolveWitnessRef(event.witness_ref);
    const finalReason = missingWitness
      ? 'EVID-001-MISSING-WITNESS'
      : reasonCode ?? undefined;

    return SkillAttributionThesisResultSchema.parse({
      skill_id: request.skill_id,
      revision_id: request.revision_id,
      passed: reasonCode === null && !missingWitness,
      thesis: request.thesis,
      ...(finalReason ? { reason_code: finalReason } : {}),
      witness_ref: witnessRef,
      evidence_refs: buildEvidenceRefs('skill_attribution_thesis_generated', witnessRef),
    });
  }

  async requestAdmission(input: SkillAdmissionRequest): Promise<SkillAdmissionResult> {
    const parsed = SkillAdmissionRequestSchema.safeParse(input);
    if (!parsed.success) {
      return this.persistResult({
        skillId: input.skill_id ?? 'unknown-skill',
        revisionId: input.revision_id ?? 'unknown-revision',
        decision: 'blocked',
        decidedBy: 'orchestration_agent',
        reasonCode: 'SKADM-003-INVALID-REQUEST',
        witnessRef: resolveWitnessRef(undefined),
      });
    }

    const request = parsed.data;
    const reasonCode = evaluateAdmissionRequest(request);
    const eventType =
      reasonCode === null ? 'skill_admission_requested' : 'skill_admission_blocked';

    const event = await this.evidenceEmitter.emit({
      event_type: eventType,
      skill_id: request.skill_id,
      revision_id: request.revision_id,
      ...(reasonCode ? { reason_code: reasonCode } : {}),
      evidence_refs: [
        ...request.validation.evidence_refs,
        ...request.benchmark.evidence_refs,
        ...request.thesis.evidence_refs,
      ],
    });

    const missingWitness = isMissingWitness(event.witness_ref);
    const witnessRef = resolveWitnessRef(event.witness_ref);
    const finalReason = missingWitness
      ? 'EVID-001-MISSING-WITNESS'
      : reasonCode ?? undefined;
    const decision: SkillAdmissionDecision =
      finalReason === null || finalReason === undefined
        ? 'pending_cortex'
        : finalReason === 'SCM-008-TRUST-REGRESSION'
          ? 'held'
          : 'blocked';

    return this.persistResult({
      skillId: request.skill_id,
      revisionId: request.revision_id,
      decision,
      decidedBy: 'orchestration_agent',
      reasonCode: finalReason,
      witnessRef,
      benchmarkEvidenceRef: request.benchmark.benchmark_evidence.benchmark_pack_ref,
      attributionThesisRef: request.thesis.thesis.thesis_ref,
    });
  }

  async recordCortexDecision(
    input: SkillAdmissionDecisionInput,
  ): Promise<SkillAdmissionResult> {
    const parsed = SkillAdmissionDecisionInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.persistResult({
        skillId: input.skill_id ?? 'unknown-skill',
        revisionId: input.revision_id ?? 'unknown-revision',
        decision: 'blocked',
        decidedBy: 'orchestration_agent',
        reasonCode: 'SKADM-003-INVALID-REQUEST',
        witnessRef: resolveWitnessRef(undefined),
      });
    }

    const decisionInput = parsed.data;
    const current = await this.stateStore.get(
      decisionInput.skill_id,
      decisionInput.revision_id,
    );

    if (decisionInput.decided_by !== 'nous_cortex') {
      return this.persistResult({
        skillId: decisionInput.skill_id,
        revisionId: decisionInput.revision_id,
        decision: 'blocked',
        decidedBy: 'orchestration_agent',
        reasonCode: 'SKADM-002-CORTEX-AUTH-REQUIRED',
        witnessRef: resolveWitnessRef(undefined),
        expectedVersion: current?.state_version,
      });
    }

    if (!current || current.decision !== 'pending_cortex') {
      return this.persistResult({
        skillId: decisionInput.skill_id,
        revisionId: decisionInput.revision_id,
        decision: 'blocked',
        decidedBy: 'orchestration_agent',
        reasonCode: 'SKADM-001-DECISION-NOT-PENDING',
        witnessRef: resolveWitnessRef(undefined),
        expectedVersion: current?.state_version,
      });
    }

    const eventType = mapDecisionToEventType(decisionInput.decision);
    const event = await this.evidenceEmitter.emit({
      event_type: eventType,
      skill_id: decisionInput.skill_id,
      revision_id: decisionInput.revision_id,
      ...(decisionInput.reason_code
        ? { reason_code: decisionInput.reason_code }
        : {}),
      evidence_refs: decisionInput.evidence_refs,
    });

    const missingWitness = isMissingWitness(event.witness_ref);
    const witnessRef = resolveWitnessRef(event.witness_ref);

    return this.persistResult({
      skillId: decisionInput.skill_id,
      revisionId: decisionInput.revision_id,
      decision: missingWitness ? 'blocked' : decisionInput.decision,
      decidedBy: missingWitness ? 'orchestration_agent' : decisionInput.decided_by,
      reasonCode: missingWitness
        ? 'EVID-001-MISSING-WITNESS'
        : decisionInput.reason_code,
      witnessRef,
      expectedVersion: current.state_version,
      benchmarkEvidenceRef: current.benchmark_evidence_ref,
      attributionThesisRef: current.attribution_thesis_ref,
    });
  }

  async getDecision(
    skillId: string,
    revisionId: string,
  ): Promise<SkillAdmissionDecisionRecord | null> {
    return this.stateStore.get(skillId, revisionId);
  }

  private async persistResult(
    input: PersistedResultInput,
  ): Promise<SkillAdmissionResult> {
    const eventType = mapDecisionToEventType(input.decision);
    const resultBase: SkillAdmissionResult = {
      skill_id: input.skillId,
      revision_id: input.revisionId,
      decision: input.decision,
      ...(input.reasonCode ? { reason_code: input.reasonCode } : {}),
      evidence_refs: buildEvidenceRefs(eventType, input.witnessRef),
      witness_ref: input.witnessRef,
      ...(input.benchmarkEvidenceRef
        ? { benchmark_evidence_ref: input.benchmarkEvidenceRef }
        : {}),
      ...(input.attributionThesisRef
        ? { attribution_thesis_ref: input.attributionThesisRef }
        : {}),
      decided_by: input.decidedBy,
      decided_at: this.now().toISOString(),
    };

    const existing = await this.stateStore.get(input.skillId, input.revisionId);
    const nextVersion = (existing?.state_version ?? 0) + 1;
    const record: SkillAdmissionDecisionRecord = {
      ...resultBase,
      state_version: nextVersion,
      updated_at: this.now().toISOString(),
    };

    try {
      await this.stateStore.upsert(
        record,
        input.expectedVersion ?? existing?.state_version,
      );
    } catch (error) {
      if (error instanceof SkillAdmissionStateConflictError) {
        return SkillAdmissionResultSchema.parse({
          ...resultBase,
          decision: 'blocked',
          reason_code: 'SKADM-001-DECISION-NOT-PENDING',
        });
      }
      throw error;
    }

    return SkillAdmissionResultSchema.parse({
      ...resultBase,
      state_version: nextVersion,
    });
  }
}
