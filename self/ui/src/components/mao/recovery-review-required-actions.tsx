'use client';

/**
 * `RecoveryReviewRequiredActions` — three-affordance surface for the
 * `recovery_blocked_review_required` `RecoveryTerminalState` value.
 *
 * Per Decision #9 §9a row 2:
 * - Review evidence (read-only; opens inspect panel scoped to the recovery
 *   evidence event ID via host-injected `onOpenEvidence`).
 * - Override and resume (state-changing; T2 floor; `action: 'resume'` —
 *   inherent T3 per `confirmation.ts:74-79`, floor no-op).
 * - Cancel run (state-changing; T2 floor; `action: 'cancel'` — inherent T2,
 *   floor no-op).
 *
 * Per Decision #9 §9c — the affordance composition is
 *   `getRequiredTier(action) → applyRecoveryTierFloor(raw) → getTierDisplay(effective)`.
 * The floor lives at the call site only; non-recovery surfaces consume
 * `getRequiredTier` directly without the floor.
 *
 * WR-162 SP 10 — see SDS § Invariants SUPV-SP10-002, SUPV-SP10-009,
 * SUPV-SP10-011, SUPV-SP10-012, SUPV-SP10-016.
 */
import * as React from 'react';
import type { ConfirmationTierDisplay } from '@nous/subcortex-opctl';
import {
  getRequiredTier,
  getTierDisplay,
} from '@nous/subcortex-opctl';
import type { ControlAction } from '@nous/shared';
import { applyRecoveryTierFloor } from './apply-recovery-tier-floor';
import type { RecoveryTerminalStateFixture } from './recovery-terminal-state-fixture';

export interface RecoveryReviewRequiredActionsProps {
  fixture: Extract<
    RecoveryTerminalStateFixture,
    { state: 'recovery_blocked_review_required' }
  >;
  /**
   * Host-injected: open the inspect panel scoped to a recovery evidence event.
   * SP 13 owns the panel-side admission of `evidenceEventId` per SUPV-SP10-016.
   */
  onOpenEvidence: (recoveryEvidenceEventId: string) => void;
  /**
   * Host-injected: fire the opctl confirmation flow for a state-changing
   * recovery affordance. SP 7 / SP 14 ratify the proof flow. SP 10 ships
   * only the typed callback shape; the host wires the real proof issuance.
   */
  onConfirmAction: (input: {
    action: ControlAction;
    displayTier: ConfirmationTierDisplay;
    runId: string;
  }) => Promise<unknown>;
}

interface AffordanceComposition {
  action: ControlAction;
  displayTier: ConfirmationTierDisplay;
}

// Package-internal helper: composes
//   getRequiredTier(action) → applyRecoveryTierFloor → getTierDisplay
// per SUPV-SP10-009 + Decision #9 §9c specification block.
function makeAffordance(action: ControlAction): AffordanceComposition {
  const raw = getRequiredTier(action);
  const effective = applyRecoveryTierFloor(raw);
  const displayTier = getTierDisplay(effective);
  return { action, displayTier };
}

export function RecoveryReviewRequiredActions({
  fixture,
  onOpenEvidence,
  onConfirmAction,
}: RecoveryReviewRequiredActionsProps): React.ReactElement {
  // 'resume' inherent T3 → floor no-op → displayTier 'Cooldown-gated'.
  const resumeAffordance = makeAffordance('resume');
  // 'cancel' inherent T2 → floor no-op → displayTier 'Two-step'.
  const cancelAffordance = makeAffordance('cancel');

  return (
    <div
      role="group"
      aria-label="Recovery review required actions"
      data-recovery-actions="review-required"
    >
      <button
        type="button"
        onClick={() => onOpenEvidence(fixture.recoveryEvidenceEventId)}
        data-recovery-action="review-evidence"
      >
        Review evidence
      </button>
      <button
        type="button"
        data-recovery-action="resume"
        data-tier={resumeAffordance.displayTier.level}
        onClick={() =>
          void onConfirmAction({
            action: resumeAffordance.action,
            displayTier: resumeAffordance.displayTier,
            runId: fixture.runId,
          })
        }
      >
        Override and resume ({resumeAffordance.displayTier.label})
      </button>
      <button
        type="button"
        data-recovery-action="cancel"
        data-tier={cancelAffordance.displayTier.level}
        onClick={() =>
          void onConfirmAction({
            action: cancelAffordance.action,
            displayTier: cancelAffordance.displayTier,
            runId: fixture.runId,
          })
        }
      >
        Cancel run ({cancelAffordance.displayTier.label})
      </button>
    </div>
  );
}
