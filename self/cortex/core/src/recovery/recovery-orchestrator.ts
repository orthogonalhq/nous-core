/**
 * Recovery orchestrator implementation.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 * FR-008: All branches converge to terminal state. No orphan recovery.
 *
 * WR-162 SP 8 — Recovery Orchestrator Expansion + Crash-Detect Wiring.
 * Body augmented with witness-evidence emission at every reachable decision
 * point in `run()` (13 of the 14 SP 2 `RecoveryEventType` literals; the 14th —
 * `fr_recovery_witness_emitted` — is reserved for SP 9 storage-layer / SP 10
 * UX consumer use per SUPV-SP8-019). Class shape, constructor (parameterless),
 * and `run()` signature are UNCHANGED — emission flows through the optional
 * `context.witness?: IWitnessService` slot per the SP 2-ratified
 * `RecoveryOrchestratorContext` extension.
 *
 * Emission discipline (SUPV-SP8-001/002/005/010/012):
 *   - Routes through `IWitnessService.appendInvariant` (sibling pattern to
 *     SP 4 sentinel + SP 6 supervisor witness emission). NO new `emit(...)`
 *     method on the witness service.
 *   - Single-emission-per-decision-point invariant — the two private helpers
 *     (`emit`, `terminate`) are the SOLE emission/return surface. The
 *     compensation-required branch is the only site that calls `this.emit`
 *     inline (twice — `compensation_started` + `compensation_applied`)
 *     before reaching `this.terminate`; per SDS § Data Model § note, the V1
 *     orchestrator marks the decision-point reach without an intervening
 *     compensation step.
 *   - Unwired-witness branch silent short-circuit (`if (!context.witness)
 *     return;`) — production bootstrap injects a real instance; tests inject
 *     `undefined` to exercise the unwired path. NO production console-log
 *     fallback.
 *   - Closed-enum constraint at the type level: `RecoveryEventType` narrows
 *     all helper signatures; `'recovery-evidence'` literal in `actionCategory`
 *     resolves through the SP 8-widened `CriticalActionCategorySchema`.
 *
 * Separate-concerns at call boundary (SUPV-SP8-008 + IP-N2):
 *   - `context.side_effect_status` value set is disjoint from
 *     `RollbackEvaluationContext.side_effect_status`. The rollback-evaluator
 *     arg keeps the literal `'idempotent'`. Disjunction asserted by
 *     UT-SP8-CTX-SES-DISJOINT.
 *   - `context.operation_class` value set is disjoint from
 *     `RollbackEvaluationContext.operation_class` (`RecoveryOperationClass`).
 *     The rollback-evaluator arg keeps the literal `'reversible'`. The
 *     orchestrator's read is consumed for emission/future surfaces only.
 *     Disjunction asserted by UT-SP8-CTX-OPCLASS-DISJOINT.
 */
import type {
  InvariantCode,
  IRecoveryOrchestrator,
  ProjectId,
  RecoveryEventType,
  RecoveryOrchestratorContext,
  RecoveryTerminalState,
} from '@nous/shared';

export class RecoveryOrchestrator implements IRecoveryOrchestrator {
  async run(context: RecoveryOrchestratorContext): Promise<RecoveryTerminalState> {
    await this.emit(context, 'fr_recovery_started');

    const chainValid = await context.checkpoint_manager.validateChain(
      context.run_id,
    );
    if (!chainValid.valid) {
      return await this.terminate(
        context,
        'recovery_blocked_review_required',
        'fr_recovery_blocked_review_required',
        'chain_invalid',
      );
    }

    await this.emit(context, 'fr_recovery_context_resolved');

    const lastCheckpoint = await context.checkpoint_manager.getLastCommitted(
      context.run_id,
    );
    if (!lastCheckpoint) {
      return await this.terminate(
        context,
        'recovery_failed_hard_stop',
        'fr_recovery_failed_hard_stop',
        'no_checkpoint',
      );
    }

    await this.emit(context, 'fr_recovery_checkpoint_captured');

    // SUPV-SP8-007 — passthrough: orchestrator-context retry_budget is consumed
    // verbatim by retry_evaluator.evaluate; the value sets are aligned (numeric
    // attempts count). Default `3` matches the pre-SP-8 hard-coded value.
    const retry_budget = context.retry_budget ?? 3;

    await this.emit(context, 'fr_recovery_retry_scheduled');
    const retryResult = await Promise.resolve(
      context.retry_evaluator.evaluate({
        failure_class: context.failure_class,
        retry_attempt: 0,
        retry_budget,
        has_idempotency_evidence: true,
        domain_scope: lastCheckpoint.domain_scope,
      }),
    );
    await this.emit(context, 'fr_recovery_retry_attempted');

    if (
      !retryResult.allowed &&
      'reason' in retryResult &&
      retryResult.reason === 'escalate'
    ) {
      return await this.terminate(
        context,
        'recovery_blocked_review_required',
        'fr_recovery_dispatched_to_principal',
        'retry_escalate',
      );
    }
    if (
      !retryResult.allowed &&
      'reason' in retryResult &&
      retryResult.reason === 'retry_blocked'
    ) {
      return await this.terminate(
        context,
        'recovery_blocked_review_required',
        'fr_recovery_blocked_review_required',
        'retry_blocked',
      );
    }

    // SUPV-SP8-009 + IP-N2 — separate-concerns at call boundary symmetric to
    // SUPV-SP8-008. RecoveryOrchestratorContext.operation_class value set is
    // disjoint from RollbackEvaluationContext.operation_class
    // (RecoveryOperationClass); value is consumed for emission/future
    // surfaces, NOT routed below.
    const operation_class = context.operation_class ?? 'reversible';
    void operation_class;

    await this.emit(context, 'fr_recovery_rollback_started');
    const rollbackResult = await Promise.resolve(
      context.rollback_evaluator.evaluate({
        operation_class: 'reversible',
        from_domain: lastCheckpoint.domain_scope,
        to_domain: lastCheckpoint.domain_scope,
        has_escalation_evidence: false,
        side_effect_status: 'idempotent',
      }),
    );
    await this.emit(context, 'fr_recovery_rollback_applied');

    if (
      !rollbackResult.allowed &&
      'reason' in rollbackResult &&
      rollbackResult.reason === 'review_required'
    ) {
      return await this.terminate(
        context,
        'recovery_blocked_review_required',
        'fr_recovery_blocked_review_required',
        'rollback_review_required',
      );
    }
    if (
      !rollbackResult.allowed &&
      'reason' in rollbackResult &&
      rollbackResult.reason === 'rollback_blocked'
    ) {
      return await this.terminate(
        context,
        'recovery_failed_hard_stop',
        'fr_recovery_failed_hard_stop',
        'rollback_blocked',
      );
    }
    if (
      !rollbackResult.allowed &&
      'reason' in rollbackResult &&
      rollbackResult.reason === 'compensation_required'
    ) {
      // Compensation pair — emission-table rows 14 + 15. The V1 orchestrator
      // does not actually execute compensation; the pair marks the
      // decision-point reach and preserves 14-event-type completeness. A
      // future SP introducing compensation execution will straddle the new
      // step naturally without a control-flow rewrite. Tested by
      // UT-SP8-EM-COMP1 (emission ordering only; not compensation execution).
      // Closes SDS-review N1.
      await this.emit(context, 'fr_recovery_compensation_started');
      await this.emit(context, 'fr_recovery_compensation_applied');
      return await this.terminate(
        context,
        'recovery_blocked_review_required',
        'fr_recovery_blocked_review_required',
        'compensation_required',
      );
    }

    return await this.terminate(
      context,
      'recovery_completed',
      'fr_recovery_completed',
    );
  }

  private async terminate(
    context: RecoveryOrchestratorContext,
    state: RecoveryTerminalState,
    eventType: RecoveryEventType,
    reason?: string,
  ): Promise<RecoveryTerminalState> {
    await this.emit(context, eventType, reason);
    return state;
  }

  private async emit(
    context: RecoveryOrchestratorContext,
    eventType: RecoveryEventType,
    reason?: string,
  ): Promise<void> {
    if (!context.witness) return;
    await context.witness.appendInvariant({
      code: 'RECOVERY-EVT' as InvariantCode,
      actionCategory: 'recovery-evidence',
      actionRef: context.run_id,
      // RecoveryOrchestratorContext.project_id is `string` (SP 2 contract);
      // WitnessInvariantInput.projectId is the branded `ProjectId`. The cast
      // mirrors the supervisor sentinel pattern (`sentinel.ts:566`) where
      // the un-branded inbound value is admitted at the type-system surface
      // and validated at runtime by `WitnessInvariantInputSchema`.
      projectId: context.project_id as ProjectId,
      actor: 'system',
      detail: {
        event_type: eventType,
        run_id: context.run_id,
        project_id: context.project_id,
        evidence_refs: [],
        ...(reason !== undefined ? { reason } : {}),
      },
    });
  }
}
