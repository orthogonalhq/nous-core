import { describe, expect, it } from 'vitest';
import {
  FrRecoveryBlockedReviewRequiredSchema,
  FrRecoveryCheckpointCapturedSchema,
  FrRecoveryCompensationAppliedSchema,
  FrRecoveryCompensationStartedSchema,
  FrRecoveryCompletedSchema,
  FrRecoveryContextResolvedSchema,
  FrRecoveryDispatchedToPrincipalSchema,
  FrRecoveryFailedHardStopSchema,
  FrRecoveryRetryAttemptedSchema,
  FrRecoveryRetryScheduledSchema,
  FrRecoveryRollbackAppliedSchema,
  FrRecoveryRollbackStartedSchema,
  FrRecoveryStartedSchema,
  FrRecoveryWitnessEmittedSchema,
  RecoveryEventSchema,
  RecoveryEventTypeSchema,
} from '../recovery-event-union.js';
import { RecoveryEvidenceEventTypeSchema } from '../recovery-events.js';

const ALL_EVENT_TYPES = [
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
] as const;

const PER_VARIANT_SCHEMAS = [
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
] as const;

describe('RecoveryEventTypeSchema', () => {
  it('accepts each of the 14 literals', () => {
    for (const t of ALL_EVENT_TYPES) {
      expect(RecoveryEventTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it('rejects an unknown literal', () => {
    expect(
      RecoveryEventTypeSchema.safeParse('fr_recovery_not_a_real_event').success,
    ).toBe(false);
  });
});

describe('per-variant recovery event schemas', () => {
  it('parse minimal payloads and fix the event_type discriminator', () => {
    ALL_EVENT_TYPES.forEach((eventType, idx) => {
      const schema = PER_VARIANT_SCHEMAS[idx]!;
      const parsed = schema.parse({
        event_type: eventType,
        run_id: 'r1',
        project_id: 'p1',
      });
      expect(parsed.event_type).toBe(eventType);
      // `evidence_refs` defaults to [] per BaseRecoveryEventPayloadSchema.
      expect(parsed.evidence_refs).toEqual([]);
    });
  });

  it('rejects a blank run_id', () => {
    expect(
      FrRecoveryStartedSchema.safeParse({
        event_type: 'fr_recovery_started',
        run_id: '',
        project_id: 'p1',
      }).success,
    ).toBe(false);
  });
});

describe('RecoveryEventSchema (discriminated union)', () => {
  it('parses a minimal payload for each of the 14 variants', () => {
    for (const eventType of ALL_EVENT_TYPES) {
      const result = RecoveryEventSchema.safeParse({
        event_type: eventType,
        run_id: 'r1',
        project_id: 'p1',
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an unknown discriminator', () => {
    expect(
      RecoveryEventSchema.safeParse({
        event_type: 'fr_recovery_not_a_real_event',
        run_id: 'r1',
        project_id: 'p1',
      }).success,
    ).toBe(false);
  });

  it('rejects missing project_id', () => {
    expect(
      RecoveryEventSchema.safeParse({
        event_type: 'fr_recovery_started',
        run_id: 'r1',
      }).success,
    ).toBe(false);
  });
});

describe('Phase 5.4 evidence-event coexistence', () => {
  it('RecoveryEvidenceEventTypeSchema and RecoveryEventTypeSchema are both callable and distinct', () => {
    // Phase 5.4 carries 22 ledger-surface literals; SP 2 carries 14 UX-facing literals.
    // This assertion documents their intentional coexistence per SDS § Failure Modes row 5.
    expect(RecoveryEvidenceEventTypeSchema).toBeDefined();
    expect(RecoveryEventTypeSchema).toBeDefined();
    expect(RecoveryEvidenceEventTypeSchema).not.toBe(RecoveryEventTypeSchema);
  });
});
