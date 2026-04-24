/**
 * Recovery event discriminated union — UX-facing surface.
 *
 * WR-162 SP 2 — System Observability and Control.
 * Canonical source: failure-recovery-ux-patterns-v1.md § 9a + failure-recovery-architecture-v1.md § FR-008 Evidence Contract.
 *
 * Coexists with the ledger-surface enum `RecoveryEvidenceEventTypeSchema`
 * in `./recovery-events.ts` (Phase 5.4, 22 literals). The UX-facing union
 * here carries exactly the 14 event types the recovery-state UI consumes
 * (per SP 2 spec Work Item 12). Disambiguated names: `RecoveryEventTypeSchema`
 * here; `RecoveryEvidenceEventTypeSchema` in the Phase 5.4 file.
 */
import { z } from 'zod';

// --- The 14 UX-facing recovery event types ---

export const RecoveryEventTypeSchema = z.enum([
  'fr_recovery_started',
  'fr_recovery_checkpoint_captured',
  'fr_recovery_retry_scheduled',
  'fr_recovery_retry_attempted',
  'fr_recovery_compensation_started',
  'fr_recovery_compensation_applied',
  'fr_recovery_rollback_started',
  'fr_recovery_rollback_applied',
  'fr_recovery_witness_emitted',
  'fr_recovery_blocked_review_required',
  'fr_recovery_completed',
  'fr_recovery_failed_hard_stop',
  'fr_recovery_dispatched_to_principal',
  'fr_recovery_context_resolved',
]);
export type RecoveryEventType = z.infer<typeof RecoveryEventTypeSchema>;

// --- Shared payload fields ---

const BaseRecoveryEventPayloadSchema = z.object({
  run_id: z.string().min(1),
  project_id: z.string().min(1),
  evidence_refs: z.array(z.string()).default([]),
  reason: z.string().optional(),
  classifier_output: z.record(z.string(), z.unknown()).optional(),
});

// --- Per-event-type variants ---
// Each variant fixes its `event_type` literal as the discriminator tag and
// extends the shared payload shape. Payloads are intentionally uniform in
// V1 (derived from FR-008 Evidence Contract); per-event payload divergence
// can be layered in a follow-up once UX consumers surface event-specific
// fields. SP 2 ships the uniform surface per Goals § In Scope #10.

function eventSchema<T extends RecoveryEventType>(eventType: T) {
  return BaseRecoveryEventPayloadSchema.extend({
    event_type: z.literal(eventType),
  });
}

export const FrRecoveryStartedSchema = eventSchema('fr_recovery_started');
export const FrRecoveryCheckpointCapturedSchema = eventSchema('fr_recovery_checkpoint_captured');
export const FrRecoveryRetryScheduledSchema = eventSchema('fr_recovery_retry_scheduled');
export const FrRecoveryRetryAttemptedSchema = eventSchema('fr_recovery_retry_attempted');
export const FrRecoveryCompensationStartedSchema = eventSchema('fr_recovery_compensation_started');
export const FrRecoveryCompensationAppliedSchema = eventSchema('fr_recovery_compensation_applied');
export const FrRecoveryRollbackStartedSchema = eventSchema('fr_recovery_rollback_started');
export const FrRecoveryRollbackAppliedSchema = eventSchema('fr_recovery_rollback_applied');
export const FrRecoveryWitnessEmittedSchema = eventSchema('fr_recovery_witness_emitted');
export const FrRecoveryBlockedReviewRequiredSchema = eventSchema('fr_recovery_blocked_review_required');
export const FrRecoveryCompletedSchema = eventSchema('fr_recovery_completed');
export const FrRecoveryFailedHardStopSchema = eventSchema('fr_recovery_failed_hard_stop');
export const FrRecoveryDispatchedToPrincipalSchema = eventSchema('fr_recovery_dispatched_to_principal');
export const FrRecoveryContextResolvedSchema = eventSchema('fr_recovery_context_resolved');

// --- Discriminated union ---

export const RecoveryEventSchema = z.discriminatedUnion('event_type', [
  FrRecoveryStartedSchema,
  FrRecoveryCheckpointCapturedSchema,
  FrRecoveryRetryScheduledSchema,
  FrRecoveryRetryAttemptedSchema,
  FrRecoveryCompensationStartedSchema,
  FrRecoveryCompensationAppliedSchema,
  FrRecoveryRollbackStartedSchema,
  FrRecoveryRollbackAppliedSchema,
  FrRecoveryWitnessEmittedSchema,
  FrRecoveryBlockedReviewRequiredSchema,
  FrRecoveryCompletedSchema,
  FrRecoveryFailedHardStopSchema,
  FrRecoveryDispatchedToPrincipalSchema,
  FrRecoveryContextResolvedSchema,
]);
export type RecoveryEvent = z.infer<typeof RecoveryEventSchema>;
