'use client';

/**
 * `RecoveryHardStopActions` — three-affordance surface for the
 * `recovery_failed_hard_stop` `RecoveryTerminalState` value.
 *
 * Per Decision #9 §9a row 3:
 * - Revert to last checkpoint (state-changing; T2 floor; `action: 'revert'` —
 *   inherent T0 per `confirmation.ts:74-79` fall-through, **floored to T2**).
 *   Principal beneficiary of the T2 floor — without it a single-click revert
 *   would surface at T0 ("Immediate") at this surface, contradicting
 *   Decision #9 §9a Rationale.
 * - Cancel run (state-changing; T2 floor; `action: 'cancel'` — inherent T2,
 *   floor no-op).
 * - View failure evidence (read-only; opens inspect panel via host-injected
 *   `onOpenEvidence`).
 *
 * WR-162 SP 10 — see SDS § Invariants SUPV-SP10-003, SUPV-SP10-009,
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

export interface RecoveryHardStopActionsProps {
  fixture: Extract<
    RecoveryTerminalStateFixture,
    { state: 'recovery_failed_hard_stop' }
  >;
  /**
   * Host-injected: open the inspect panel scoped to a recovery evidence event.
   * SP 13 owns the panel-side admission of `evidenceEventId` per SUPV-SP10-016.
   */
  onOpenEvidence: (recoveryEvidenceEventId: string) => void;
  /**
   * Host-injected: fire the opctl confirmation flow for a state-changing
   * recovery affordance. SP 7 / SP 14 ratify the proof flow.
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

export function RecoveryHardStopActions({
  fixture,
  onOpenEvidence,
  onConfirmAction,
}: RecoveryHardStopActionsProps): React.ReactElement {
  // 'revert' inherent T0 (fall-through default) → floor lifts to T2.
  // Principal beneficiary of the recovery-UX T2 floor per Decision #9 §9a
  // Rationale.
  const revertAffordance = makeAffordance('revert');
  // 'cancel' inherent T2 → floor no-op → displayTier 'Two-step'.
  const cancelAffordance = makeAffordance('cancel');

  return (
    <div
      role="group"
      aria-label="Recovery hard-stop actions"
      data-recovery-actions="hard-stop"
    >
      <button
        type="button"
        data-recovery-action="revert"
        data-tier={revertAffordance.displayTier.level}
        onClick={() =>
          void onConfirmAction({
            action: revertAffordance.action,
            displayTier: revertAffordance.displayTier,
            runId: fixture.runId,
          })
        }
      >
        Revert to last checkpoint ({revertAffordance.displayTier.label})
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
      <button
        type="button"
        onClick={() => onOpenEvidence(fixture.recoveryEvidenceEventId)}
        data-recovery-action="view-failure-evidence"
      >
        View failure evidence
      </button>
    </div>
  );
}
