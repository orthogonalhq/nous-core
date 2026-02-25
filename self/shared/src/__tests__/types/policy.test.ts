import { describe, it, expect } from 'vitest';
import {
  PolicyReasonCodeSchema,
  PolicyDecisionRecordSchema,
  POLICY_REASON_CODES,
} from '../../types/policy.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
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
});
