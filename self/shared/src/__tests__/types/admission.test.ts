/**
 * Admission schema contract tests.
 *
 * Phase 5.1 — Workmode Enforcement and Authority-Chain Baseline.
 */
import { describe, it, expect } from 'vitest';
import {
  AdmissionResultSchema,
  WorkmodeEventTypeSchema,
  LifecycleActionSchema,
} from '../../types/admission.js';

describe('AdmissionResultSchema', () => {
  it('accepts allowed: true', () => {
    expect(AdmissionResultSchema.safeParse({ allowed: true }).success).toBe(true);
  });

  it('accepts allowed: false with reasonCode and evidenceRefs', () => {
    const result = AdmissionResultSchema.safeParse({
      allowed: false,
      reasonCode: 'WMODE-002',
      evidenceRefs: ['evidence-1'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects allowed: false with empty evidenceRefs', () => {
    const result = AdmissionResultSchema.safeParse({
      allowed: false,
      reasonCode: 'WMODE-002',
      evidenceRefs: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects allowed: false without reasonCode', () => {
    const result = AdmissionResultSchema.safeParse({
      allowed: false,
      evidenceRefs: ['evidence-1'],
    });
    expect(result.success).toBe(false);
  });
});

describe('WorkmodeEventTypeSchema', () => {
  it('accepts all canonical event types', () => {
    expect(
      WorkmodeEventTypeSchema.safeParse('wmode_activation_allowed').success,
    ).toBe(true);
    expect(
      WorkmodeEventTypeSchema.safeParse('wmode_authority_violation_blocked')
        .success,
    ).toBe(true);
  });

  it('rejects invalid event type', () => {
    expect(WorkmodeEventTypeSchema.safeParse('invalid').success).toBe(false);
  });
});

describe('LifecycleActionSchema', () => {
  it('accepts all lifecycle actions', () => {
    expect(LifecycleActionSchema.safeParse('start').success).toBe(true);
    expect(LifecycleActionSchema.safeParse('pause').success).toBe(true);
    expect(LifecycleActionSchema.safeParse('resume').success).toBe(true);
    expect(LifecycleActionSchema.safeParse('stop').success).toBe(true);
    expect(LifecycleActionSchema.safeParse('recover').success).toBe(true);
  });

  it('rejects invalid action', () => {
    expect(LifecycleActionSchema.safeParse('invalid').success).toBe(false);
  });
});
