/**
 * Supervisor domain schema round-trip tests (WR-162 SP 1).
 *
 * Every new Zod schema has a happy-path parse and at least one rejection
 * case. Fixtures derive from the verbatim examples in:
 * - supervisor-violation-taxonomy-v1.md
 * - supervisor-evidence-contract-v1.md
 * - supervisor-topology-architecture-v1.md
 * - supervisor-trpc-procedure-set-v1.md
 * - supervisor-observation-contract-v1.md
 */
import { describe, it, expect } from 'vitest';
import {
  SupervisorSeveritySchema,
  SupCodeSchema,
  SupervisorEnforcementActionSchema,
  GuardrailStatusSchema,
  WitnessIntegrityStatusSchema,
  SupervisorViolationRecordSchema,
  SentinelRiskScoreSchema,
  SupervisorStatusSnapshotSchema,
  SupervisorObservationSchema,
} from '../../types/supervisor.js';
import {
  SupervisorViolationDetectedPayloadSchema,
  SupervisorEnforcementActionPayloadSchema,
  SupervisorAnomalyClassifiedPayloadSchema,
  SupervisorSentinelStatusPayloadSchema,
} from '../../event-bus/types.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const NOW = '2026-04-14T12:34:56.789Z';

describe('SupervisorSeveritySchema', () => {
  it('accepts S0..S3', () => {
    for (const sev of ['S0', 'S1', 'S2', 'S3'] as const) {
      expect(SupervisorSeveritySchema.parse(sev)).toBe(sev);
    }
  });

  it('rejects S4', () => {
    expect(() => SupervisorSeveritySchema.parse('S4')).toThrow();
  });
});

describe('SupCodeSchema', () => {
  it('accepts SUP-NNN three-digit codes', () => {
    expect(SupCodeSchema.parse('SUP-001')).toBe('SUP-001');
    expect(SupCodeSchema.parse('SUP-012')).toBe('SUP-012');
  });

  it('rejects malformed codes', () => {
    expect(SupCodeSchema.safeParse('SUP-1').success).toBe(false);
    expect(SupCodeSchema.safeParse('SUP-0001').success).toBe(false);
    expect(SupCodeSchema.safeParse('SUP-01a').success).toBe(false);
    expect(SupCodeSchema.safeParse('supervisor').success).toBe(false);
  });
});

describe('SupervisorEnforcementActionSchema', () => {
  it('accepts all four enforcement actions', () => {
    for (const a of [
      'hard_stop',
      'auto_pause',
      'require_review',
      'warn',
    ] as const) {
      expect(SupervisorEnforcementActionSchema.parse(a)).toBe(a);
    }
  });

  it('rejects unknown action', () => {
    expect(SupervisorEnforcementActionSchema.safeParse('halt').success).toBe(
      false,
    );
  });
});

describe('GuardrailStatusSchema', () => {
  it('accepts clear | warning | violation | enforced', () => {
    for (const s of ['clear', 'warning', 'violation', 'enforced'] as const) {
      expect(GuardrailStatusSchema.parse(s)).toBe(s);
    }
  });

  it('rejects unknown status', () => {
    expect(GuardrailStatusSchema.safeParse('ok').success).toBe(false);
  });
});

describe('WitnessIntegrityStatusSchema', () => {
  it('accepts intact | degraded | broken', () => {
    for (const s of ['intact', 'degraded', 'broken'] as const) {
      expect(WitnessIntegrityStatusSchema.parse(s)).toBe(s);
    }
  });

  it('rejects unknown status', () => {
    expect(WitnessIntegrityStatusSchema.safeParse('unknown').success).toBe(
      false,
    );
  });
});

describe('SupervisorViolationRecordSchema', () => {
  const valid = {
    supCode: 'SUP-003',
    severity: 'S1' as const,
    agentId: 'agent-abc',
    agentClass: 'Worker',
    runId: 'run-xyz',
    projectId: PROJECT_ID,
    evidenceRefs: ['witness://evt-1', 'witness://evt-2'],
    detectedAt: NOW,
    enforcement: {
      action: 'auto_pause' as const,
      commandId: 'cmd-001',
      enforcedAt: NOW,
    },
  };

  it('parses a full violation record with camelCase properties', () => {
    const parsed = SupervisorViolationRecordSchema.parse(valid);
    expect(parsed).toHaveProperty('supCode', 'SUP-003');
    expect(parsed).toHaveProperty('agentId', 'agent-abc');
    expect(parsed).toHaveProperty('runId', 'run-xyz');
    expect(parsed).toHaveProperty('projectId', PROJECT_ID);
    expect(parsed).toHaveProperty('evidenceRefs');
    expect(parsed).toHaveProperty('detectedAt');
    expect(parsed.enforcement?.commandId).toBe('cmd-001');
  });

  it('accepts null enforcement (anomaly or pending incident)', () => {
    const parsed = SupervisorViolationRecordSchema.parse({
      ...valid,
      enforcement: null,
    });
    expect(parsed.enforcement).toBeNull();
  });

  it('rejects missing projectId', () => {
    const { projectId: _drop, ...rest } = valid;
    void _drop;
    expect(SupervisorViolationRecordSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects non-ISO detectedAt', () => {
    expect(
      SupervisorViolationRecordSchema.safeParse({
        ...valid,
        detectedAt: 'not-a-date',
      }).success,
    ).toBe(false);
  });

  it('rejects bad supCode regex', () => {
    expect(
      SupervisorViolationRecordSchema.safeParse({
        ...valid,
        supCode: 'SUP-1',
      }).success,
    ).toBe(false);
  });
});

describe('SentinelRiskScoreSchema', () => {
  const valid = {
    projectId: PROJECT_ID,
    compositeRiskScore: 0.42,
    activeAnomalies: [
      {
        supCode: 'SUP-009',
        riskScore: 0.6,
        explanation: 'elevated failure rate',
        agentId: 'agent-xyz',
        classifiedAt: NOW,
      },
    ],
    reportedAt: NOW,
  };

  it('parses with nested anomalies and bounded compositeRiskScore', () => {
    const parsed = SentinelRiskScoreSchema.parse(valid);
    expect(parsed.compositeRiskScore).toBe(0.42);
    expect(parsed.activeAnomalies[0]?.supCode).toBe('SUP-009');
  });

  it('rejects compositeRiskScore out of [0, 1]', () => {
    expect(
      SentinelRiskScoreSchema.safeParse({
        ...valid,
        compositeRiskScore: 1.5,
      }).success,
    ).toBe(false);
  });

  it('rejects nested negative riskScore', () => {
    expect(
      SentinelRiskScoreSchema.safeParse({
        ...valid,
        activeAnomalies: [
          { ...valid.activeAnomalies[0]!, riskScore: -0.1 },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects missing reportedAt', () => {
    const { reportedAt: _drop, ...rest } = valid;
    void _drop;
    expect(SentinelRiskScoreSchema.safeParse(rest).success).toBe(false);
  });
});

describe('SupervisorStatusSnapshotSchema', () => {
  const valid = {
    active: true,
    agentsMonitored: 7,
    activeViolationCounts: { s0: 0, s1: 1, s2: 0, s3: 0 },
    lifetime: {
      violationsDetected: 3,
      anomaliesClassified: 11,
      enforcementsApplied: 2,
    },
    witnessIntegrity: 'intact' as const,
    riskSummary: { [PROJECT_ID]: 0.15 },
    reportedAt: NOW,
  };

  it('parses a full status snapshot', () => {
    const parsed = SupervisorStatusSnapshotSchema.parse(valid);
    expect(parsed.active).toBe(true);
    expect(parsed.activeViolationCounts.s1).toBe(1);
    expect(parsed.witnessIntegrity).toBe('intact');
  });

  it('rejects negative activeViolationCount', () => {
    expect(
      SupervisorStatusSnapshotSchema.safeParse({
        ...valid,
        activeViolationCounts: { s0: -1, s1: 0, s2: 0, s3: 0 },
      }).success,
    ).toBe(false);
  });

  it('rejects missing witnessIntegrity', () => {
    const { witnessIntegrity: _drop, ...rest } = valid;
    void _drop;
    expect(SupervisorStatusSnapshotSchema.safeParse(rest).success).toBe(false);
  });
});

describe('SupervisorObservationSchema', () => {
  it('accepts each of the four sources with varied payload shapes', () => {
    for (const source of [
      'gateway_outbox',
      'event_bus',
      'witness_service',
      'health_sink',
    ] as const) {
      expect(
        SupervisorObservationSchema.parse({
          observedAt: NOW,
          source,
          payload: { anything: 'goes' },
        }).source,
      ).toBe(source);
    }

    // payload: z.unknown() accepts any shape
    expect(
      SupervisorObservationSchema.parse({
        observedAt: NOW,
        source: 'event_bus',
        payload: [1, 2, 3],
      }).source,
    ).toBe('event_bus');
    expect(
      SupervisorObservationSchema.parse({
        observedAt: NOW,
        source: 'health_sink',
        payload: null,
      }).payload,
    ).toBeNull();
    expect(
      SupervisorObservationSchema.parse({
        observedAt: NOW,
        source: 'witness_service',
        payload: 'string payload',
      }).payload,
    ).toBe('string payload');
  });

  it('rejects unknown source', () => {
    expect(
      SupervisorObservationSchema.safeParse({
        observedAt: NOW,
        source: 'health_pulse',
        payload: {},
      }).success,
    ).toBe(false);
  });

  it('rejects non-ISO observedAt', () => {
    expect(
      SupervisorObservationSchema.safeParse({
        observedAt: 'whenever',
        source: 'event_bus',
        payload: {},
      }).success,
    ).toBe(false);
  });
});

// --- Channel payload schemas (snake_case per SP1-INV-005) ---

describe('SupervisorViolationDetectedPayloadSchema', () => {
  const valid = {
    sup_code: 'SUP-003',
    severity: 'S1' as const,
    agent_id: 'agent-abc',
    agent_class: 'Worker',
    run_id: 'run-xyz',
    project_id: PROJECT_ID,
    evidence_refs: ['witness://evt-1'],
    detected_at: NOW,
  };

  it('parses with snake_case properties verbatim', () => {
    const parsed = SupervisorViolationDetectedPayloadSchema.parse(valid);
    expect(parsed).toHaveProperty('sup_code', 'SUP-003');
    expect(parsed).toHaveProperty('agent_id', 'agent-abc');
    expect(parsed).toHaveProperty('run_id', 'run-xyz');
    expect(parsed).toHaveProperty('project_id', PROJECT_ID);
    expect(parsed).toHaveProperty('evidence_refs');
    expect(parsed).toHaveProperty('detected_at');
  });

  it('rejects bad sup_code regex', () => {
    expect(
      SupervisorViolationDetectedPayloadSchema.safeParse({
        ...valid,
        sup_code: 'not-a-sup',
      }).success,
    ).toBe(false);
  });
});

describe('SupervisorEnforcementActionPayloadSchema', () => {
  const valid = {
    sup_code: 'SUP-001',
    severity: 'S0' as const,
    action: 'hard_stop' as const,
    scope: 'project_run_scope',
    command_id: 'cmd-007',
    agent_id: 'agent-abc',
    run_id: 'run-xyz',
    project_id: PROJECT_ID,
    evidence_refs: ['witness://evt-1'],
    enforced_at: NOW,
  };

  it('parses enforcement payload with snake_case fields', () => {
    const parsed = SupervisorEnforcementActionPayloadSchema.parse(valid);
    expect(parsed).toHaveProperty('action', 'hard_stop');
    expect(parsed).toHaveProperty('command_id', 'cmd-007');
    expect(parsed).toHaveProperty('enforced_at');
  });

  it('rejects invalid action literal', () => {
    expect(
      SupervisorEnforcementActionPayloadSchema.safeParse({
        ...valid,
        action: 'warn',
      }).success,
    ).toBe(false);
  });
});

describe('SupervisorAnomalyClassifiedPayloadSchema', () => {
  const valid = {
    sup_code: 'SUP-009',
    risk_score: 0.72,
    explanation: 'elevated failure rate',
    agent_id: 'agent-abc',
    agent_class: 'Worker',
    run_id: 'run-xyz',
    project_id: PROJECT_ID,
    triggering_event_refs: ['witness://evt-1', 'witness://evt-2'],
    classified_at: NOW,
  };

  it('parses anomaly payload with snake_case fields', () => {
    const parsed = SupervisorAnomalyClassifiedPayloadSchema.parse(valid);
    expect(parsed).toHaveProperty('risk_score', 0.72);
    expect(parsed).toHaveProperty('triggering_event_refs');
    expect(parsed).toHaveProperty('classified_at');
  });

  it('rejects risk_score out of [0, 1]', () => {
    expect(
      SupervisorAnomalyClassifiedPayloadSchema.safeParse({
        ...valid,
        risk_score: 1.5,
      }).success,
    ).toBe(false);
  });
});

describe('SupervisorSentinelStatusPayloadSchema', () => {
  const valid = {
    active: true,
    agents_monitored: 5,
    violations_detected: 2,
    anomalies_classified: 3,
    risk_summary: { [PROJECT_ID]: 0.15 },
    reported_at: NOW,
  };

  it('parses sentinel status payload with snake_case fields', () => {
    const parsed = SupervisorSentinelStatusPayloadSchema.parse(valid);
    expect(parsed).toHaveProperty('agents_monitored', 5);
    expect(parsed).toHaveProperty('violations_detected', 2);
    expect(parsed).toHaveProperty('anomalies_classified', 3);
    expect(parsed).toHaveProperty('risk_summary');
    expect(parsed).toHaveProperty('reported_at');
  });

  it('rejects negative agents_monitored', () => {
    expect(
      SupervisorSentinelStatusPayloadSchema.safeParse({
        ...valid,
        agents_monitored: -1,
      }).success,
    ).toBe(false);
  });
});
