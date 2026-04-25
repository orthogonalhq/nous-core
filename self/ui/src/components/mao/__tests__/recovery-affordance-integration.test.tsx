// @vitest-environment jsdom

import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { RecoveryHardStopActions } from '../recovery-hard-stop-actions';
import { RecoveryReviewRequiredActions } from '../recovery-review-required-actions';
import {
  recoveryHardStopFixture,
  recoveryReviewRequiredFixture,
} from './fixtures/recovery-terminal-state-fixtures';

/**
 * IT-SP10-INTEG-* — End-to-end integration tests for the recovery affordances.
 *
 * Per SDS § Invariants SUPV-SP10-017 + Goals SC-8 + SC-9. The integration
 * tests use the **production** `getRequiredTier` + `getTierDisplay` from
 * `@nous/subcortex-opctl` (no mocks) plus the production
 * `applyRecoveryTierFloor`; only the host callbacks (`onOpenEvidence`,
 * `onConfirmAction`) are mocked. This proves the composition chain
 *   getRequiredTier → applyRecoveryTierFloor → getTierDisplay
 * runs end-to-end at the component DOM surface, with the displayTier shape
 * matching SP 7's `ConfirmationTierDisplay` contract verbatim.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Recovery affordance integration (SP 10)', () => {
  it('IT-SP10-INTEG-HARDSTOP-REVERT — seeded recovery_failed_hard_stop -> revert click yields T2-floored displayTier', () => {
    const onConfirmAction = vi.fn().mockResolvedValue(undefined);
    const onOpenEvidence = vi.fn();

    render(
      <RecoveryHardStopActions
        fixture={recoveryHardStopFixture}
        onOpenEvidence={onOpenEvidence}
        onConfirmAction={onConfirmAction}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /revert to last checkpoint/i }),
    );

    expect(onConfirmAction).toHaveBeenCalledTimes(1);
    const callArg = onConfirmAction.mock.calls[0][0];
    expect(callArg.action).toBe('revert');
    expect(callArg.runId).toBe(recoveryHardStopFixture.runId);
    // Production composition: getRequiredTier('revert') -> 'T0' (fall-through),
    // applyRecoveryTierFloor('T0') -> 'T2', getTierDisplay('T2') -> 'Two-step'.
    expect(callArg.displayTier.level).toBe('T2');
    expect(callArg.displayTier.label).toBe('Two-step');
    expect(callArg.displayTier.severity).toBe('high');
    expect(callArg.displayTier.rationaleKey).toBe('tier.t2.rationale');
  });

  it('IT-SP10-INTEG-REVIEW-RESUME — seeded recovery_blocked_review_required -> override-and-resume click yields T3 unchanged', () => {
    const onConfirmAction = vi.fn().mockResolvedValue(undefined);
    const onOpenEvidence = vi.fn();

    render(
      <RecoveryReviewRequiredActions
        fixture={recoveryReviewRequiredFixture}
        onOpenEvidence={onOpenEvidence}
        onConfirmAction={onConfirmAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /override and resume/i }));

    expect(onConfirmAction).toHaveBeenCalledTimes(1);
    const callArg = onConfirmAction.mock.calls[0][0];
    expect(callArg.action).toBe('resume');
    expect(callArg.runId).toBe(recoveryReviewRequiredFixture.runId);
    // Production composition: getRequiredTier('resume') -> 'T3',
    // applyRecoveryTierFloor('T3') -> 'T3' (no-op), getTierDisplay('T3') -> 'Cooldown-gated'.
    expect(callArg.displayTier.level).toBe('T3');
    expect(callArg.displayTier.label).toBe('Cooldown-gated');
    expect(callArg.displayTier.severity).toBe('critical');
    expect(callArg.displayTier.cooldownMs).toBe(0);
    expect(callArg.displayTier.rationaleKey).toBe('tier.t3.rationale');
  });

  it('IT-SP10-INTEG-HARDSTOP-EVIDENCE — seeded recovery_failed_hard_stop -> view-failure-evidence routes evidence event ID to host', () => {
    const onConfirmAction = vi.fn().mockResolvedValue(undefined);
    const onOpenEvidence = vi.fn();

    render(
      <RecoveryHardStopActions
        fixture={recoveryHardStopFixture}
        onOpenEvidence={onOpenEvidence}
        onConfirmAction={onConfirmAction}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /view failure evidence/i }),
    );

    expect(onOpenEvidence).toHaveBeenCalledTimes(1);
    expect(onOpenEvidence).toHaveBeenCalledWith(
      recoveryHardStopFixture.recoveryEvidenceEventId,
    );
    expect(onConfirmAction).not.toHaveBeenCalled();
  });
});
