/**
 * Recovery orchestrator implementation.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 * FR-008: All branches converge to terminal state. No orphan recovery.
 */
import type {
  IRecoveryOrchestrator,
  RecoveryOrchestratorContext,
  RecoveryTerminalState,
} from '@nous/shared';

export class RecoveryOrchestrator implements IRecoveryOrchestrator {
  async run(context: RecoveryOrchestratorContext): Promise<RecoveryTerminalState> {
    const chainValid = await context.checkpoint_manager.validateChain(
      context.run_id,
    );
    if (!chainValid.valid) {
      return 'recovery_blocked_review_required';
    }

    const lastCheckpoint = await context.checkpoint_manager.getLastCommitted(
      context.run_id,
    );
    if (!lastCheckpoint) {
      return 'recovery_failed_hard_stop';
    }

    const retryResult = await Promise.resolve(
      context.retry_evaluator.evaluate({
        failure_class: context.failure_class,
        retry_attempt: 0,
        retry_budget: 3,
        has_idempotency_evidence: true,
        domain_scope: lastCheckpoint.domain_scope,
      }),
    );

    if (
      !retryResult.allowed &&
      'reason' in retryResult &&
      retryResult.reason === 'escalate'
    ) {
      return 'recovery_blocked_review_required';
    }
    if (
      !retryResult.allowed &&
      'reason' in retryResult &&
      retryResult.reason === 'retry_blocked'
    ) {
      return 'recovery_blocked_review_required';
    }

    const rollbackResult = await Promise.resolve(
      context.rollback_evaluator.evaluate({
        operation_class: 'reversible',
        from_domain: lastCheckpoint.domain_scope,
        to_domain: lastCheckpoint.domain_scope,
        has_escalation_evidence: false,
        side_effect_status: 'idempotent',
      }),
    );

    if (
      !rollbackResult.allowed &&
      'reason' in rollbackResult &&
      rollbackResult.reason === 'review_required'
    ) {
      return 'recovery_blocked_review_required';
    }
    if (
      !rollbackResult.allowed &&
      'reason' in rollbackResult &&
      rollbackResult.reason === 'rollback_blocked'
    ) {
      return 'recovery_failed_hard_stop';
    }
    if (
      !rollbackResult.allowed &&
      'reason' in rollbackResult &&
      rollbackResult.reason === 'compensation_required'
    ) {
      return 'recovery_blocked_review_required';
    }

    return 'recovery_completed';
  }
}
