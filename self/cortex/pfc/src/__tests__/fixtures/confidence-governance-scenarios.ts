import type {
  ConfidenceGovernanceEvaluationInput,
  EscalationSignal,
  LearnedBehaviorExplanation,
  Phase6ConfidenceSignalExport,
  Phase6DistilledPatternExport,
} from '@nous/shared';

export const PATTERN_ID = '550e8400-e29b-41d4-a716-446655440100' as never;
export const SOURCE_ID = '550e8400-e29b-41d4-a716-446655440101' as never;
export const SUPERSEDED_ID = '550e8400-e29b-41d4-a716-446655440102' as never;
export const TRACE_ID = '550e8400-e29b-41d4-a716-446655440103' as never;
export const AUTH_EVENT_ID = '550e8400-e29b-41d4-a716-446655440104' as never;
export const COMPLETION_EVENT_ID =
  '550e8400-e29b-41d4-a716-446655440105' as never;

export const PRIMARY_EVIDENCE_REF = {
  actionCategory: 'memory-write' as const,
  authorizationEventId: AUTH_EVENT_ID,
};

export const SECONDARY_EVIDENCE_REF = {
  actionCategory: 'trace-persist' as const,
  completionEventId: COMPLETION_EVENT_ID,
};

export const BASE_PATTERN: Phase6DistilledPatternExport = {
  id: PATTERN_ID,
  content: 'Pattern content',
  confidence: 0.94,
  basedOn: [SOURCE_ID],
  supersedes: [SUPERSEDED_ID],
  evidenceRefs: [PRIMARY_EVIDENCE_REF, SECONDARY_EVIDENCE_REF],
  scope: 'project',
  tags: ['phase-8.6'],
  createdAt: '2026-03-07T08:00:00.000Z',
  updatedAt: '2026-03-07T08:05:00.000Z',
};

export const BASE_EXPLANATION: LearnedBehaviorExplanation = {
  patternId: PATTERN_ID,
  outcomeRef: 'outcome-123',
  evidenceRefs: [PRIMARY_EVIDENCE_REF],
  distillationRef: TRACE_ID,
};

export const BASE_CONFIDENCE_SIGNAL: Phase6ConfidenceSignalExport = {
  tier: 'high',
  confidence: 0.94,
  supportingSignals: 18,
  patternId: PATTERN_ID,
  decayState: 'stable',
};

export function createEscalationSignal(
  reasonCode: EscalationSignal['reasonCode'],
  overrides: Partial<EscalationSignal> = {},
): EscalationSignal {
  return {
    reasonCode,
    traceId: TRACE_ID,
    evidenceRefs: [PRIMARY_EVIDENCE_REF],
    patternId: PATTERN_ID,
    ...overrides,
  };
}

export function createEvaluationInput(
  overrides: {
    governance?: ConfidenceGovernanceEvaluationInput['governance'];
    actionCategory?: ConfidenceGovernanceEvaluationInput['actionCategory'];
    projectControlState?: ConfidenceGovernanceEvaluationInput['projectControlState'];
    pattern?: Partial<Phase6DistilledPatternExport>;
    confidenceSignal?: Partial<Phase6ConfidenceSignalExport>;
    explanation?: Partial<LearnedBehaviorExplanation>;
    escalationSignal?: Partial<EscalationSignal> | null;
  } = {},
): ConfidenceGovernanceEvaluationInput {
  const pattern: Phase6DistilledPatternExport = {
    ...BASE_PATTERN,
    ...overrides.pattern,
  };
  const confidenceSignal: Phase6ConfidenceSignalExport = {
    ...BASE_CONFIDENCE_SIGNAL,
    ...overrides.confidenceSignal,
  };
  const explanation: LearnedBehaviorExplanation = {
    ...BASE_EXPLANATION,
    ...overrides.explanation,
  };
  const escalationSignal =
    overrides.escalationSignal === null
      ? undefined
      : {
          ...createEscalationSignal('CONF-LOW'),
          ...overrides.escalationSignal,
        };

  return {
    governance: overrides.governance ?? 'may',
    actionCategory: overrides.actionCategory ?? 'model-invoke',
    projectControlState: overrides.projectControlState ?? 'running',
    pattern,
    confidenceSignal,
    explanation,
    ...(escalationSignal ? { escalationSignal } : {}),
  };
}
