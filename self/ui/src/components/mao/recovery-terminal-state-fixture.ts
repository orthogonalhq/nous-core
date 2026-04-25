/**
 * Discriminated-union prop shape for recovery terminal-state UI components.
 *
 * SP 10 components (`RecoveryStateBanner`, `RecoveryReviewRequiredActions`,
 * `RecoveryHardStopActions`) consume this fixture via discriminated narrowing
 * (`Extract<RecoveryTerminalStateFixture, { state: ... }>`) — the type is the
 * SDS-time contract for "what data does each component need?" Live consumers
 * (SP 13 / SP 14) construct the fixture-shape from live recovery-orchestrator
 * output; SP 10 ships the type as a public contract surface.
 *
 * The discriminator literal `state` tracks the `RecoveryTerminalState` closed
 * enum from `@nous/shared` verbatim; compile-time exhaustiveness is enforced
 * at the host dispatch surface (SP 13 / SP 14 own).
 *
 * WR-162 SP 10 — see SDS § Data Model and § Invariants SUPV-SP10-018.
 */
export type RecoveryTerminalStateFixture =
  | {
      state: 'recovery_completed';
      runId: string;
      recoveryEvidenceEventId: string;
      outcomeSummary: string;
    }
  | {
      state: 'recovery_blocked_review_required';
      runId: string;
      recoveryEvidenceEventId: string;
    }
  | {
      state: 'recovery_failed_hard_stop';
      runId: string;
      recoveryEvidenceEventId: string;
    };
