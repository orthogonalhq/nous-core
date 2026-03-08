import {
  CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING,
  ConfidenceGovernanceEvaluationInputSchema,
  ConfidenceGovernanceEvaluationResultSchema,
  HIGH_RISK_ACTION_CATEGORIES,
  ValidationError,
  type ConfidenceGovernanceDecisionReasonCode,
  type ConfidenceGovernanceEvaluationInput,
  type ConfidenceGovernanceEvaluationResult,
  type EscalationSignal,
  type TraceEvidenceReference,
} from '@nous/shared';

export type ConfidenceGovernanceMetricName =
  | 'confidence_governance_decision_total'
  | 'confidence_governance_control_state_block_total'
  | 'confidence_governance_high_risk_override_total'
  | 'confidence_governance_escalation_total'
  | 'confidence_governance_missing_context_total';

export interface ConfidenceGovernanceObserverMetric {
  name: ConfidenceGovernanceMetricName;
  value: number;
  labels?: Record<string, string | number | boolean>;
}

export interface ConfidenceGovernanceObserverLog {
  event: 'confidence_governance.runtime.decision';
  fields: Record<string, unknown>;
}

export interface ConfidenceGovernanceObserver {
  metric(input: ConfidenceGovernanceObserverMetric): void | Promise<void>;
  log(input: ConfidenceGovernanceObserverLog): void | Promise<void>;
}

function toValidationError(
  message: string,
  issues: Array<{ path: string; message: string }>,
): ValidationError {
  return new ValidationError(message, issues);
}

function evidenceRefKey(ref: TraceEvidenceReference): string {
  return JSON.stringify(
    Object.entries(ref).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function mergeEvidenceRefs(
  ...collections: Array<TraceEvidenceReference[] | undefined>
): TraceEvidenceReference[] {
  const merged = new Map<string, TraceEvidenceReference>();

  for (const refs of collections) {
    for (const ref of refs ?? []) {
      merged.set(evidenceRefKey(ref), ref);
    }
  }

  return [...merged.values()];
}

function buildResult(
  input: ConfidenceGovernanceEvaluationInput,
  overrides: Pick<
    ConfidenceGovernanceEvaluationResult,
    | 'outcome'
    | 'reasonCode'
    | 'autonomyAllowed'
    | 'requiresConfirmation'
    | 'highRiskOverrideApplied'
  >,
): ConfidenceGovernanceEvaluationResult {
  return ConfidenceGovernanceEvaluationResultSchema.parse({
    outcome: overrides.outcome,
    reasonCode: overrides.reasonCode,
    governance: input.governance,
    actionCategory: input.actionCategory,
    projectControlState: input.projectControlState,
    patternId: input.pattern.id,
    confidence: input.confidenceSignal.confidence,
    confidenceTier: input.confidenceSignal.tier,
    supportingSignals: input.confidenceSignal.supportingSignals,
    decayState: input.confidenceSignal.decayState,
    autonomyAllowed: overrides.autonomyAllowed,
    requiresConfirmation: overrides.requiresConfirmation,
    highRiskOverrideApplied: overrides.highRiskOverrideApplied,
    evidenceRefs: mergeEvidenceRefs(
      input.pattern.evidenceRefs,
      input.explanation.evidenceRefs,
      input.escalationSignal?.evidenceRefs,
    ),
    explanation: input.explanation,
    escalationSignal: input.escalationSignal,
  });
}

function resolveEscalationReasonCode(
  escalationSignal: EscalationSignal,
): ConfidenceGovernanceDecisionReasonCode {
  switch (escalationSignal.reasonCode) {
    case 'CONF-CONTRADICTION':
      return 'CGR-ESCALATE-CONTRADICTION';
    case 'CONF-STALENESS':
      return 'CGR-ESCALATE-STALENESS';
    case 'CONF-RETIREMENT':
      return 'CGR-ESCALATE-RETIREMENT';
    case 'CONF-LOW':
    default:
      return 'CGR-ESCALATE-LOW-CONFIDENCE';
  }
}

function resolveStableDecision(
  input: ConfidenceGovernanceEvaluationInput,
): ConfidenceGovernanceEvaluationResult {
  // Phase 4.4 export-hooks: this canonical mapping is the only allowed
  // source of MAY/SHOULD/MUST autonomy behavior.
  const mapping = CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING.find(
    (entry) => entry.tier === input.confidenceSignal.tier,
  );

  if (!mapping) {
    throw new Error(
      `Missing confidence-governance mapping for tier ${input.confidenceSignal.tier}`,
    );
  }

  if (input.governance === 'must') {
    return buildResult(input, {
      outcome: 'deny',
      reasonCode: 'CGR-DENY-GOVERNANCE-CEILING',
      autonomyAllowed: false,
      requiresConfirmation: false,
      highRiskOverrideApplied: false,
    });
  }

  if (
    input.governance === 'may' &&
    mapping.mayAutonomyAllowed &&
    mapping.maxGovernanceForAutonomy === 'may'
  ) {
    return buildResult(input, {
      outcome: 'allow_autonomy',
      reasonCode: 'CGR-ALLOW-AUTONOMY',
      autonomyAllowed: true,
      requiresConfirmation: false,
      highRiskOverrideApplied: false,
    });
  }

  return buildResult(input, {
    outcome: 'allow_with_flag',
    reasonCode: 'CGR-ALLOW-WITH-FLAG',
    autonomyAllowed: false,
    requiresConfirmation: false,
    highRiskOverrideApplied: false,
  });
}

export function evaluateConfidenceGovernanceRuntime(
  input: ConfidenceGovernanceEvaluationInput,
): ConfidenceGovernanceEvaluationResult {
  const parsed = ConfidenceGovernanceEvaluationInputSchema.safeParse(input);
  if (!parsed.success) {
    throw toValidationError(
      'Invalid ConfidenceGovernanceEvaluationInput',
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const evaluationInput = parsed.data;

  switch (evaluationInput.projectControlState) {
    case 'hard_stopped':
      return buildResult(evaluationInput, {
        outcome: 'deny',
        reasonCode: 'CGR-DENY-HARD-STOPPED',
        autonomyAllowed: false,
        requiresConfirmation: false,
        highRiskOverrideApplied: false,
      });
    case 'paused_review':
      return buildResult(evaluationInput, {
        outcome: 'defer',
        reasonCode: 'CGR-DEFER-PAUSED-REVIEW',
        autonomyAllowed: false,
        requiresConfirmation: false,
        highRiskOverrideApplied: false,
      });
    case 'resuming':
      return buildResult(evaluationInput, {
        outcome: 'defer',
        reasonCode: 'CGR-DEFER-RESUMING',
        autonomyAllowed: false,
        requiresConfirmation: false,
        highRiskOverrideApplied: false,
      });
    default:
      break;
  }

  if (HIGH_RISK_ACTION_CATEGORIES.includes(evaluationInput.actionCategory)) {
    // Phase 4.4 export-hooks: these protected categories always require
    // confirmation regardless of confidence tier or governance level.
    return buildResult(evaluationInput, {
      outcome: 'defer',
      reasonCode: 'CGR-DEFER-HIGH-RISK-CONFIRMATION',
      autonomyAllowed: false,
      requiresConfirmation: true,
      highRiskOverrideApplied: true,
    });
  }

  const requiresEscalationContext =
    evaluationInput.confidenceSignal.tier === 'low' ||
    evaluationInput.confidenceSignal.decayState !== 'stable';

  if (requiresEscalationContext) {
    if (!evaluationInput.escalationSignal) {
      return buildResult(evaluationInput, {
        outcome: 'deny',
        reasonCode: 'CGR-DENY-MISSING-ESCALATION-CONTEXT',
        autonomyAllowed: false,
        requiresConfirmation: false,
        highRiskOverrideApplied: false,
      });
    }

    return buildResult(evaluationInput, {
      outcome: 'escalate',
      reasonCode: resolveEscalationReasonCode(
        evaluationInput.escalationSignal,
      ),
      autonomyAllowed: false,
      requiresConfirmation: false,
      highRiskOverrideApplied: false,
    });
  }

  return resolveStableDecision(evaluationInput);
}

export async function observeConfidenceGovernanceDecision(
  decision: ConfidenceGovernanceEvaluationResult,
  observer?: ConfidenceGovernanceObserver,
): Promise<void> {
  if (!observer) {
    return;
  }

  await observer.metric({
    name: 'confidence_governance_decision_total',
    value: 1,
    labels: {
      outcome: decision.outcome,
      reasonCode: decision.reasonCode,
      governance: decision.governance,
      tier: decision.confidenceTier,
      actionCategory: decision.actionCategory,
    },
  });

  if (
    decision.reasonCode === 'CGR-DENY-HARD-STOPPED' ||
    decision.reasonCode === 'CGR-DEFER-PAUSED-REVIEW' ||
    decision.reasonCode === 'CGR-DEFER-RESUMING'
  ) {
    await observer.metric({
      name: 'confidence_governance_control_state_block_total',
      value: 1,
      labels: {
        controlState: decision.projectControlState ?? 'unknown',
        outcome: decision.outcome,
      },
    });
  }

  if (decision.highRiskOverrideApplied) {
    await observer.metric({
      name: 'confidence_governance_high_risk_override_total',
      value: 1,
      labels: {
        actionCategory: decision.actionCategory,
      },
    });
  }

  if (decision.outcome === 'escalate') {
    await observer.metric({
      name: 'confidence_governance_escalation_total',
      value: 1,
      labels: {
        reasonCode: decision.reasonCode,
        governance: decision.governance,
        tier: decision.confidenceTier,
      },
    });
  }

  if (decision.reasonCode === 'CGR-DENY-MISSING-ESCALATION-CONTEXT') {
    await observer.metric({
      name: 'confidence_governance_missing_context_total',
      value: 1,
      labels: {
        missingField: 'escalationSignal',
      },
    });
  }

  await observer.log({
    event: 'confidence_governance.runtime.decision',
    fields: {
      patternId: decision.patternId,
      governance: decision.governance,
      actionCategory: decision.actionCategory,
      projectControlState: decision.projectControlState,
      confidence: decision.confidence,
      confidenceTier: decision.confidenceTier,
      supportingSignals: decision.supportingSignals,
      decayState: decision.decayState,
      outcome: decision.outcome,
      reasonCode: decision.reasonCode,
      requiresConfirmation: decision.requiresConfirmation,
      highRiskOverrideApplied: decision.highRiskOverrideApplied,
      evidenceRefCount: decision.evidenceRefs.length,
      escalationReasonCode: decision.escalationSignal?.reasonCode,
    },
  });
}
