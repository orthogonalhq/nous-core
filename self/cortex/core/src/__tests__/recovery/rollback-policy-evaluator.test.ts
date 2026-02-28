/**
 * Rollback policy evaluator behavior tests.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 */
import { describe, it, expect } from 'vitest';
import { RollbackPolicyEvaluator } from '../../recovery/rollback-policy-evaluator.js';

describe('RollbackPolicyEvaluator', () => {
  const evaluator = new RollbackPolicyEvaluator();

  it('returns rollback_allowed for reversible within same domain', () => {
    const result = evaluator.evaluate({
      operation_class: 'reversible',
      from_domain: 'step_domain',
      to_domain: 'step_domain',
      has_escalation_evidence: false,
      side_effect_status: 'idempotent',
    });
    expect(result.allowed).toBe(true);
  });

  it('returns review_required for unknown_external_effect', () => {
    const result = evaluator.evaluate({
      operation_class: 'reversible',
      from_domain: 'step_domain',
      to_domain: 'step_domain',
      has_escalation_evidence: false,
      side_effect_status: 'unknown_external_effect',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('review_required');
  });

  it('returns rollback_blocked for irreversible', () => {
    const result = evaluator.evaluate({
      operation_class: 'irreversible',
      from_domain: 'step_domain',
      to_domain: 'step_domain',
      has_escalation_evidence: false,
      side_effect_status: 'idempotent',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('rollback_blocked');
  });

  it('returns compensation_required for compensatable', () => {
    const result = evaluator.evaluate({
      operation_class: 'compensatable',
      from_domain: 'step_domain',
      to_domain: 'step_domain',
      has_escalation_evidence: false,
      side_effect_status: 'compensatable',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('compensation_required');
  });
});
