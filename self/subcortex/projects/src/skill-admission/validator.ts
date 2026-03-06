import type {
  SkillAdmissionReasonCode,
  SkillAdmissionRequest,
  SkillAttributionThesisRequest,
  SkillBenchEvaluationRequest,
  SkillContractValidationRequest,
  SkillContractViolation,
} from '@nous/shared';

const violation = (
  code: SkillAdmissionReasonCode,
  detail: string,
  evidenceRef: string,
): SkillContractViolation => ({
  code,
  detail,
  evidence_refs: [evidenceRef],
});

export const evaluateSkillContract = (
  request: SkillContractValidationRequest,
): SkillContractViolation[] => {
  const violations: SkillContractViolation[] = [];

  if (request.authoring_workmode !== 'system:skill_authoring') {
    violations.push(
      violation(
        'SCM-001-WORKMODE-REQUIRED',
        `Unexpected authoring workmode ${request.authoring_workmode}.`,
        `workmode:${request.authoring_workmode}`,
      ),
    );
  }

  if (!request.artifact.has_skill_md) {
    violations.push(
      violation(
        'SCM-007-RUNTIME-CONTRACT-MISSING',
        'SKILL.md is required for runtime compatibility.',
        `artifact:${request.artifact.skill_root_ref}/SKILL.md`,
      ),
    );
  }

  if (request.artifact.has_flow_yaml && request.artifact.step_refs.length === 0) {
    violations.push(
      violation(
        'SCM-007-FLOW-STEPS-MISSING',
        'Graph mode was declared without any step refs.',
        `artifact:${request.artifact.skill_root_ref}/steps`,
      ),
    );
  }

  return violations;
};

export const evaluateSkillBench = (
  request: SkillBenchEvaluationRequest,
): SkillAdmissionReasonCode | null => {
  if (request.evidence.drift_detected) {
    return request.evidence.drift_reason_code ?? 'SCM-005-MODEL-DRIFT';
  }
  return null;
};

export const evaluateAttributionThesis = (
  request: SkillAttributionThesisRequest,
): SkillAdmissionReasonCode | null => {
  const { thesis } = request;
  if (
    thesis.uplift_source === 'inconclusive' &&
    thesis.recommendation === 'promote'
  ) {
    return 'SCM-004-INCONCLUSIVE-ATTRIBUTION';
  }
  return null;
};

export const evaluateAdmissionRequest = (
  request: SkillAdmissionRequest,
): SkillAdmissionReasonCode | null => {
  if (!request.validation.passed) {
    return 'SCM-004-CONTRACT-VALIDATION-REQUIRED';
  }

  if (!request.benchmark.passed) {
    return request.benchmark.reason_code ?? 'SCM-004-BENCH-EVIDENCE-REQUIRED';
  }

  if (!request.thesis.passed) {
    return request.thesis.reason_code ?? 'SCM-004-THESIS-REQUIRED';
  }

  if (
    request.requested_by === 'worker_agent' &&
    request.requested_decision === 'promote'
  ) {
    return 'SCM-003-WORKER-SELF-PROMOTION';
  }

  if (request.safety_regression_open || request.trust_regression_open) {
    return 'SCM-008-TRUST-REGRESSION';
  }

  if (
    request.requested_decision === 'promote' &&
    request.thesis.thesis.uplift_source === 'inconclusive'
  ) {
    return 'SCM-004-INCONCLUSIVE-ATTRIBUTION';
  }

  return null;
};

