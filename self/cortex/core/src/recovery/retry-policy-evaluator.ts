/**
 * Retry policy evaluator implementation.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 * FR-004: Side-effect retry requires idempotency evidence. FR-005: Budget enforced.
 */
import type {
  IRetryPolicyEvaluator,
  RetryPolicyResult,
  RetryEvaluationContext,
} from '@nous/shared';

export class RetryPolicyEvaluator implements IRetryPolicyEvaluator {
  evaluate(context: RetryEvaluationContext): RetryPolicyResult {
    if (context.failure_class !== 'retryable_transient') {
      return { allowed: false, reason: 'retry_blocked' };
    }
    if (context.retry_attempt >= context.retry_budget) {
      return { allowed: false, reason: 'escalate' };
    }
    if (!context.has_idempotency_evidence) {
      return { allowed: false, reason: 'retry_blocked' };
    }
    return { allowed: true };
  }
}
