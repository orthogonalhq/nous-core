/**
 * Adversarial recovery tests.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 * V1 success criteria: unbounded retry impossible; unknown_external_effect blocks resume.
 */
import { describe, it, expect } from 'vitest';
import { RetryPolicyEvaluator } from '../../recovery/retry-policy-evaluator.js';
import { RollbackPolicyEvaluator } from '../../recovery/rollback-policy-evaluator.js';

describe('Phase 5.4 — Recovery adversarial', () => {
  const retryEvaluator = new RetryPolicyEvaluator();
  const rollbackEvaluator = new RollbackPolicyEvaluator();

  it('unbounded retry impossible: budget exhausted triggers escalate', () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = retryEvaluator.evaluate({
        failure_class: 'retryable_transient',
        retry_attempt: attempt,
        retry_budget: 3,
        has_idempotency_evidence: true,
        domain_scope: 'step_domain',
      });
      if (attempt >= 3) {
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('escalate');
      }
    }
  });

  it('no retry without idempotency proof for side-effecting ops', () => {
    const result = retryEvaluator.evaluate({
      failure_class: 'retryable_transient',
      retry_attempt: 0,
      retry_budget: 10,
      has_idempotency_evidence: false,
      domain_scope: 'step_domain',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('retry_blocked');
  });

  it('unknown_external_effect blocks auto-resume', () => {
    const result = rollbackEvaluator.evaluate({
      operation_class: 'reversible',
      from_domain: 'step_domain',
      to_domain: 'step_domain',
      has_escalation_evidence: false,
      side_effect_status: 'unknown_external_effect',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('review_required');
  });
});
