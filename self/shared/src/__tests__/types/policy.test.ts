import { describe, it, expect } from 'vitest';
import {
  PolicyReasonCodeSchema,
  PolicyDecisionRecordSchema,
  PolicyAccessContextSchema,
  PolicyEvaluationResultSchema,
  POLICY_REASON_CODES,
} from '../../types/policy.js';
import { DEFAULT_MEMORY_ACCESS_POLICY } from '../../types/memory.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const TARGET_UUID = '660e8400-e29b-41d4-a716-446655440001';
const NOW = new Date().toISOString();

describe('PolicyReasonCodeSchema', () => {
  it('accepts POL-* format', () => {
    expect(PolicyReasonCodeSchema.safeParse('POL-DEFAULT').success).toBe(true);
    expect(PolicyReasonCodeSchema.safeParse('POL-DENIED').success).toBe(true);
    expect(PolicyReasonCodeSchema.safeParse('POL-NODE-OVERRIDE').success).toBe(
      true,
    );
    expect(PolicyReasonCodeSchema.safeParse('POL-INVALID-OVERRIDE').success).toBe(
      true,
    );
  });

  it('rejects invalid format', () => {
    expect(PolicyReasonCodeSchema.safeParse('pol-denied').success).toBe(false);
    expect(PolicyReasonCodeSchema.safeParse('POL').success).toBe(false);
    expect(PolicyReasonCodeSchema.safeParse('POLINVALID').success).toBe(false);
    expect(PolicyReasonCodeSchema.safeParse('MEM-AUTHORITY').success).toBe(false);
  });
});

describe('POLICY_REASON_CODES', () => {
  it('all keys are valid PolicyReasonCode', () => {
    for (const code of Object.keys(POLICY_REASON_CODES)) {
      expect(PolicyReasonCodeSchema.safeParse(code).success).toBe(true);
    }
  });
});

describe('PolicyDecisionRecordSchema', () => {
  const validRecord = {
    id: VALID_UUID,
    projectId: VALID_UUID,
    action: 'read' as const,
    outcome: 'allowed' as const,
    reasonCode: 'POL-DEFAULT',
    reason: 'Policy default applied',
    occurredAt: NOW,
  };

  it('accepts valid record with required fields', () => {
    expect(PolicyDecisionRecordSchema.safeParse(validRecord).success).toBe(
      true,
    );
  });

  it('accepts record with optional fields', () => {
    const withOptionals = {
      ...validRecord,
      targetProjectId: '660e8400-e29b-41d4-a716-446655440001',
      nodeId: VALID_UUID,
      traceId: VALID_UUID,
    };
    expect(PolicyDecisionRecordSchema.safeParse(withOptionals).success).toBe(
      true,
    );
  });

  it('parse round-trip preserves data', () => {
    const result = PolicyDecisionRecordSchema.safeParse(validRecord);
    expect(result.success).toBe(true);
    if (result.success) {
      const parsed = result.data;
      expect(parsed.projectId).toBe(VALID_UUID);
      expect(parsed.reasonCode).toBe('POL-DEFAULT');
      expect(parsed.action).toBe('read');
      expect(parsed.outcome).toBe('allowed');
    }
  });

  it('rejects invalid reasonCode', () => {
    const result = PolicyDecisionRecordSchema.safeParse({
      ...validRecord,
      reasonCode: 'INVALID',
    });
    expect(result.success).toBe(false);
  });

  it('accepts record with evidenceRefs default', () => {
    const result = PolicyDecisionRecordSchema.safeParse(validRecord);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evidenceRefs).toEqual([]);
    }
  });
});

describe('PolicyAccessContextSchema', () => {
  const readContext = {
    action: 'read' as const,
    fromProjectId: VALID_UUID,
    targetProjectId: TARGET_UUID,
    includeGlobal: true,
    projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
    targetProjectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
  };

  it('accepts read shape with targetProjectId and targetProjectPolicy', () => {
    expect(PolicyAccessContextSchema.safeParse(readContext).success).toBe(true);
  });

  it('accepts retrieve shape with targetProjectIds and targetProjectPolicies', () => {
    const retrieveContext = {
      action: 'retrieve' as const,
      fromProjectId: VALID_UUID,
      targetProjectIds: [TARGET_UUID],
      includeGlobal: true,
      projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
      targetProjectPolicies: { [TARGET_UUID]: DEFAULT_MEMORY_ACCESS_POLICY },
    };
    expect(PolicyAccessContextSchema.safeParse(retrieveContext).success).toBe(
      true,
    );
  });

  it('accepts retrieve shape with includeGlobal only', () => {
    const retrieveGlobal = {
      action: 'retrieve' as const,
      fromProjectId: VALID_UUID,
      includeGlobal: true,
      projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
    };
    expect(PolicyAccessContextSchema.safeParse(retrieveGlobal).success).toBe(
      true,
    );
  });

  it('accepts write shape with includeGlobal only', () => {
    const globalWrite = {
      action: 'write' as const,
      fromProjectId: VALID_UUID,
      includeGlobal: true,
      projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
    };
    expect(PolicyAccessContextSchema.safeParse(globalWrite).success).toBe(
      true,
    );
  });
});

describe('PolicyEvaluationResultSchema', () => {
  const validResult = {
    allowed: true,
    reasonCode: 'POL-DEFAULT',
    reason: 'Policy default applied',
    decisionRecord: {
      id: VALID_UUID,
      projectId: VALID_UUID,
      action: 'read' as const,
      outcome: 'allowed' as const,
      reasonCode: 'POL-DEFAULT',
      reason: 'Policy default applied',
      occurredAt: NOW,
    },
  };

  it('accepts valid result', () => {
    expect(PolicyEvaluationResultSchema.safeParse(validResult).success).toBe(
      true,
    );
  });

  it('parse round-trip preserves data', () => {
    const result = PolicyEvaluationResultSchema.safeParse(validResult);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allowed).toBe(true);
      expect(result.data.reasonCode).toBe('POL-DEFAULT');
    }
  });
});

describe('POLICY_REASON_CODES Phase 3.2', () => {
  it('includes enforcement codes', () => {
    expect(PolicyReasonCodeSchema.safeParse('POL-CANNOT-READ-FROM').success).toBe(
      true,
    );
    expect(PolicyReasonCodeSchema.safeParse('POL-CANNOT-BE-READ-BY').success).toBe(
      true,
    );
    expect(PolicyReasonCodeSchema.safeParse('POL-GLOBAL-DENIED').success).toBe(
      true,
    );
    expect(
      PolicyReasonCodeSchema.safeParse('POL-CONTROL-STATE-BLOCKED').success,
    ).toBe(true);
    expect(PolicyReasonCodeSchema.safeParse('POL-PAUSED-BLOCKED').success).toBe(
      true,
    );
  });
});
