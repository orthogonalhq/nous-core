/**
 * Rollback policy evaluator implementation.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 * FR-006: unknown_external_effect blocks auto-resume. FR-007: Cross-domain requires escalation.
 */
import type {
  IRollbackPolicyEvaluator,
  RollbackPolicyResult,
  RollbackEvaluationContext,
} from '@nous/shared';

export class RollbackPolicyEvaluator implements IRollbackPolicyEvaluator {
  evaluate(context: RollbackEvaluationContext): RollbackPolicyResult {
    if (context.side_effect_status === 'unknown_external_effect') {
      return { allowed: false, reason: 'review_required' };
    }
    if (context.operation_class === 'irreversible') {
      return { allowed: false, reason: 'rollback_blocked' };
    }
    if (context.operation_class === 'compensatable') {
      return { allowed: false, reason: 'compensation_required' };
    }
    if (context.from_domain !== context.to_domain && !context.has_escalation_evidence) {
      return { allowed: false, reason: 'rollback_blocked' };
    }
    return { allowed: true };
  }
}
