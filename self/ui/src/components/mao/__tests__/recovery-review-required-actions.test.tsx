// @vitest-environment jsdom

import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { RecoveryReviewRequiredActions } from '../recovery-review-required-actions';
import { recoveryReviewRequiredFixture } from './fixtures/recovery-terminal-state-fixtures';

/**
 * UT-SP10-REVIEW-* — `RecoveryReviewRequiredActions` component tests.
 *
 * Per SDS § Invariants SUPV-SP10-002 + SUPV-SP10-009 + SUPV-SP10-011 +
 * SUPV-SP10-016 + SUPV-SP10-020. Five tests covering: render, T3 inherent
 * resume composition (floor no-op), T2 inherent cancel composition (floor
 * no-op), evidence-link routing through host callback, reduced-motion.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderHarness(overrides?: {
  onOpenEvidence?: ReturnType<typeof vi.fn>;
  onConfirmAction?: ReturnType<typeof vi.fn>;
}) {
  const onOpenEvidence = overrides?.onOpenEvidence ?? vi.fn();
  const onConfirmAction =
    overrides?.onConfirmAction ?? vi.fn().mockResolvedValue(undefined);
  render(
    <RecoveryReviewRequiredActions
      fixture={recoveryReviewRequiredFixture}
      onOpenEvidence={onOpenEvidence}
      onConfirmAction={onConfirmAction}
    />,
  );
  return { onOpenEvidence, onConfirmAction };
}

describe('RecoveryReviewRequiredActions (SP 10)', () => {
  it('UT-SP10-REVIEW-RENDER — renders the three Decision #9 §9a row 2 affordances', () => {
    renderHarness();
    expect(screen.getByRole('button', { name: /review evidence/i })).toBeDefined();
    expect(
      screen.getByRole('button', { name: /override and resume/i }),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: /cancel run/i })).toBeDefined();
  });

  it("UT-SP10-REVIEW-T3-RESUME — 'resume' inherent T3 is unchanged by the floor and reaches onConfirmAction", () => {
    const { onConfirmAction } = renderHarness();
    const resumeButton = screen.getByRole('button', {
      name: /override and resume/i,
    });
    expect(resumeButton.getAttribute('data-tier')).toBe('T3');

    fireEvent.click(resumeButton);

    expect(onConfirmAction).toHaveBeenCalledTimes(1);
    const callArg = onConfirmAction.mock.calls[0][0];
    expect(callArg.action).toBe('resume');
    expect(callArg.runId).toBe(recoveryReviewRequiredFixture.runId);
    expect(callArg.displayTier.level).toBe('T3');
    expect(callArg.displayTier.label).toBe('Cooldown-gated');
    expect(callArg.displayTier.severity).toBe('critical');
    expect(callArg.displayTier.cooldownMs).toBe(0);
    expect(callArg.displayTier.rationaleKey).toBe('tier.t3.rationale');
  });

  it("UT-SP10-REVIEW-T2-CANCEL — 'cancel' inherent T2 is unchanged by the floor", () => {
    const { onConfirmAction } = renderHarness();
    const cancelButton = screen.getByRole('button', { name: /cancel run/i });
    expect(cancelButton.getAttribute('data-tier')).toBe('T2');

    fireEvent.click(cancelButton);

    expect(onConfirmAction).toHaveBeenCalledTimes(1);
    const callArg = onConfirmAction.mock.calls[0][0];
    expect(callArg.action).toBe('cancel');
    expect(callArg.runId).toBe(recoveryReviewRequiredFixture.runId);
    expect(callArg.displayTier.level).toBe('T2');
    expect(callArg.displayTier.label).toBe('Two-step');
    expect(callArg.displayTier.severity).toBe('high');
    expect(callArg.displayTier.rationaleKey).toBe('tier.t2.rationale');
  });

  it('UT-SP10-REVIEW-EVIDENCE-ROUTE — review-evidence button routes through host callback with the recovery evidence event ID', () => {
    const { onOpenEvidence, onConfirmAction } = renderHarness();
    fireEvent.click(screen.getByRole('button', { name: /review evidence/i }));

    expect(onOpenEvidence).toHaveBeenCalledTimes(1);
    expect(onOpenEvidence).toHaveBeenCalledWith(
      recoveryReviewRequiredFixture.recoveryEvidenceEventId,
    );
    expect(onConfirmAction).not.toHaveBeenCalled();
  });

  it('UT-SP10-REVIEW-REDUCED-MOTION — affordances remain accessibility-visible under prefers-reduced-motion: reduce', () => {
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: matchMediaMock,
    });

    renderHarness();

    expect(screen.getByRole('button', { name: /review evidence/i })).toBeDefined();
    expect(
      screen.getByRole('button', { name: /override and resume/i }),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: /cancel run/i })).toBeDefined();
  });
});
