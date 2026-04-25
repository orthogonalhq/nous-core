/**
 * Mocked terminal-state fixtures for SP 10 component tests.
 *
 * Three discriminated-union values, one per `RecoveryTerminalState` literal,
 * each with hard-coded UUID-shaped `runId` + `recoveryEvidenceEventId` and
 * (for `recovery_completed`) a hard-coded `outcomeSummary` string. Fixtures
 * are package-internal; NOT exported from `@nous/ui`. Live wiring (SP 13 /
 * SP 14) replaces fixture values with orchestrator output.
 *
 * WR-162 SP 10 — see SDS § Invariants SUPV-SP10-018 (closes Goals N1).
 */
import type { RecoveryTerminalStateFixture } from '../../recovery-terminal-state-fixture';

export const recoveryCompletedFixture: Extract<
  RecoveryTerminalStateFixture,
  { state: 'recovery_completed' }
> = {
  state: 'recovery_completed',
  runId: '00000000-0000-4000-8000-000000000001',
  recoveryEvidenceEventId: '00000000-0000-4000-8000-000000000010',
  outcomeSummary:
    'Recovery completed via checkpoint replay (3 retried operations succeeded).',
};

export const recoveryReviewRequiredFixture: Extract<
  RecoveryTerminalStateFixture,
  { state: 'recovery_blocked_review_required' }
> = {
  state: 'recovery_blocked_review_required',
  runId: '00000000-0000-4000-8000-000000000002',
  recoveryEvidenceEventId: '00000000-0000-4000-8000-000000000020',
};

export const recoveryHardStopFixture: Extract<
  RecoveryTerminalStateFixture,
  { state: 'recovery_failed_hard_stop' }
> = {
  state: 'recovery_failed_hard_stop',
  runId: '00000000-0000-4000-8000-000000000003',
  recoveryEvidenceEventId: '00000000-0000-4000-8000-000000000030',
};
