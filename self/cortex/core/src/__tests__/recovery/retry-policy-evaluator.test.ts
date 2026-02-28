/**
 * Retry policy evaluator behavior tests.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 */
import { describe, it, expect } from 'vitest';
import { RetryPolicyEvaluator } from '../../recovery/retry-policy-evaluator.js';

describe('RetryPolicyEvaluator', () => {
  const evaluator = new RetryPolicyEvaluator();

  it('returns retry_allowed for retryable_transient with budget and idempotency', () => {
    const result = evaluator.evaluate({
      failure_class: 'retryable_transient',
      retry_attempt: 0,
      retry_budget: 3,
      has_idempotency_evidence: true,
      domain_scope: 'step_domain',
    });
    expect(result.allowed).toBe(true);
  });

  it('returns retry_blocked for side-effect without idempotency', () => {
    const result = evaluator.evaluate({
      failure_class: 'retryable_transient',
      retry_attempt: 0,
      retry_budget: 3,
      has_idempotency_evidence: false,
      domain_scope: 'step_domain',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('retry_blocked');
  });

  it('returns escalate when budget exhausted', () => {
    const result = evaluator.evaluate({
      failure_class: 'retryable_transient',
      retry_attempt: 3,
      retry_budget: 3,
      has_idempotency_evidence: true,
      domain_scope: 'step_domain',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('escalate');
  });

  it('returns retry_blocked for non-retryable failure class', () => {
    const result = evaluator.evaluate({
      failure_class: 'unknown_external_effect',
      retry_attempt: 0,
      retry_budget: 3,
      has_idempotency_evidence: true,
      domain_scope: 'step_domain',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('retry_blocked');
  });
});
