import { describe, it, expect } from 'vitest';
import {
  ThoughtPfcDecisionPayloadSchema,
  ThoughtTurnLifecyclePayloadSchema,
} from '../types.js';

const NOW = new Date().toISOString();

const validPfcPayload = {
  traceId: 'trace-001',
  thoughtType: 'confidence-governance' as const,
  decision: 'approved' as const,
  confidence: 0.85,
  reason: 'High confidence score meets threshold',
  content: 'Confidence governance approved with score 0.85',
  sequence: 0,
  emittedAt: NOW,
};

const validLifecyclePayload = {
  traceId: 'trace-001',
  phase: 'turn-start' as const,
  status: 'started' as const,
  content: 'Turn execution beginning',
  sequence: 0,
  emittedAt: NOW,
};

describe('ThoughtPfcDecisionPayloadSchema', () => {
  it('accepts a valid PFC decision payload', () => {
    const result = ThoughtPfcDecisionPayloadSchema.safeParse(validPfcPayload);
    expect(result.success).toBe(true);
  });

  it('accepts payload without optional confidence', () => {
    const { confidence: _, ...withoutConfidence } = validPfcPayload;
    const result = ThoughtPfcDecisionPayloadSchema.safeParse(withoutConfidence);
    expect(result.success).toBe(true);
  });

  it('accepts confidence at boundary 0', () => {
    const result = ThoughtPfcDecisionPayloadSchema.safeParse({
      ...validPfcPayload,
      confidence: 0,
    });
    expect(result.success).toBe(true);
  });

  it('accepts confidence at boundary 1', () => {
    const result = ThoughtPfcDecisionPayloadSchema.safeParse({
      ...validPfcPayload,
      confidence: 1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects confidence greater than 1', () => {
    const result = ThoughtPfcDecisionPayloadSchema.safeParse({
      ...validPfcPayload,
      confidence: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative confidence', () => {
    const result = ThoughtPfcDecisionPayloadSchema.safeParse({
      ...validPfcPayload,
      confidence: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid thoughtType enum', () => {
    const result = ThoughtPfcDecisionPayloadSchema.safeParse({
      ...validPfcPayload,
      thoughtType: 'invalid-type',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid decision enum', () => {
    const result = ThoughtPfcDecisionPayloadSchema.safeParse({
      ...validPfcPayload,
      decision: 'maybe',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = ThoughtPfcDecisionPayloadSchema.safeParse({
      traceId: 'trace-001',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid thoughtType values', () => {
    const types = [
      'confidence-governance',
      'memory-write',
      'memory-mutation',
      'tool-execution',
      'reflection',
      'escalation',
    ] as const;

    for (const thoughtType of types) {
      const result = ThoughtPfcDecisionPayloadSchema.safeParse({
        ...validPfcPayload,
        thoughtType,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid decision values', () => {
    const decisions = ['approved', 'denied', 'neutral'] as const;

    for (const decision of decisions) {
      const result = ThoughtPfcDecisionPayloadSchema.safeParse({
        ...validPfcPayload,
        decision,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('ThoughtTurnLifecyclePayloadSchema', () => {
  it('accepts a valid turn lifecycle payload', () => {
    const result = ThoughtTurnLifecyclePayloadSchema.safeParse(validLifecyclePayload);
    expect(result.success).toBe(true);
  });

  it('accepts payload without optional content', () => {
    const { content: _, ...withoutContent } = validLifecyclePayload;
    const result = ThoughtTurnLifecyclePayloadSchema.safeParse(withoutContent);
    expect(result.success).toBe(true);
  });

  it('rejects invalid phase enum', () => {
    const result = ThoughtTurnLifecyclePayloadSchema.safeParse({
      ...validLifecyclePayload,
      phase: 'bogus',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status enum', () => {
    const result = ThoughtTurnLifecyclePayloadSchema.safeParse({
      ...validLifecyclePayload,
      status: 'unknown',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = ThoughtTurnLifecyclePayloadSchema.safeParse({
      traceId: 'trace-001',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid phase values', () => {
    const phases = [
      'turn-start',
      'opctl-check',
      'gateway-run',
      'response-resolved',
      'stm-finalize',
      'trace-record',
      'turn-complete',
    ] as const;

    for (const phase of phases) {
      const result = ThoughtTurnLifecyclePayloadSchema.safeParse({
        ...validLifecyclePayload,
        phase,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid status values', () => {
    const statuses = ['started', 'completed', 'failed'] as const;

    for (const status of statuses) {
      const result = ThoughtTurnLifecyclePayloadSchema.safeParse({
        ...validLifecyclePayload,
        status,
      });
      expect(result.success).toBe(true);
    }
  });
});
