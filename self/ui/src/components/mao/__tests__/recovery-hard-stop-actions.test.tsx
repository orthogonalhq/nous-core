// @vitest-environment jsdom

import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { RecoveryHardStopActions } from '../recovery-hard-stop-actions';
import { recoveryHardStopFixture } from './fixtures/recovery-terminal-state-fixtures';

/**
 * UT-SP10-HARDSTOP-* — `RecoveryHardStopActions` component tests.
 *
 * Per SDS § Invariants SUPV-SP10-003 + SUPV-SP10-009 + SUPV-SP10-011 +
 * SUPV-SP10-016 + SUPV-SP10-020. Five tests including the **principal T2
 * floor benefit verification** for `'revert'` (inherent T0 → floored T2).
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
    <RecoveryHardStopActions
      fixture={recoveryHardStopFixture}
      onOpenEvidence={onOpenEvidence}
      onConfirmAction={onConfirmAction}
    />,
  );
  return { onOpenEvidence, onConfirmAction };
}

describe('RecoveryHardStopActions (SP 10)', () => {
  it('UT-SP10-HARDSTOP-RENDER — renders the three Decision #9 §9a row 3 affordances', () => {
    renderHarness();
    expect(
      screen.getByRole('button', { name: /revert to last checkpoint/i }),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: /cancel run/i })).toBeDefined();
    expect(
      screen.getByRole('button', { name: /view failure evidence/i }),
    ).toBeDefined();
  });

  it("UT-SP10-HARDSTOP-T2-FLOORED-REVERT — 'revert' inherent T0 is floored to T2 (principal benefit)", () => {
    const { onConfirmAction } = renderHarness();
    const revertButton = screen.getByRole('button', {
      name: /revert to last checkpoint/i,
    });
    expect(revertButton.getAttribute('data-tier')).toBe('T2');

    fireEvent.click(revertButton);

    expect(onConfirmAction).toHaveBeenCalledTimes(1);
    const callArg = onConfirmAction.mock.calls[0][0];
    expect(callArg.action).toBe('revert');
    expect(callArg.runId).toBe(recoveryHardStopFixture.runId);
    expect(callArg.displayTier.level).toBe('T2');
    expect(callArg.displayTier.label).toBe('Two-step');
    expect(callArg.displayTier.severity).toBe('high');
    expect(callArg.displayTier.rationaleKey).toBe('tier.t2.rationale');
  });

  it("UT-SP10-HARDSTOP-T2-CANCEL — 'cancel' inherent T2 is unchanged by the floor", () => {
    const { onConfirmAction } = renderHarness();
    const cancelButton = screen.getByRole('button', { name: /cancel run/i });
    expect(cancelButton.getAttribute('data-tier')).toBe('T2');

    fireEvent.click(cancelButton);

    expect(onConfirmAction).toHaveBeenCalledTimes(1);
    const callArg = onConfirmAction.mock.calls[0][0];
    expect(callArg.action).toBe('cancel');
    expect(callArg.displayTier.level).toBe('T2');
  });

  it('UT-SP10-HARDSTOP-EVIDENCE-ROUTE — view-failure-evidence routes through host callback with the recovery evidence event ID', () => {
    const { onOpenEvidence, onConfirmAction } = renderHarness();
    fireEvent.click(
      screen.getByRole('button', { name: /view failure evidence/i }),
    );

    expect(onOpenEvidence).toHaveBeenCalledTimes(1);
    expect(onOpenEvidence).toHaveBeenCalledWith(
      recoveryHardStopFixture.recoveryEvidenceEventId,
    );
    expect(onConfirmAction).not.toHaveBeenCalled();
  });

  it('UT-SP10-HARDSTOP-REDUCED-MOTION — affordances remain accessibility-visible under prefers-reduced-motion: reduce', () => {
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

    expect(
      screen.getByRole('button', { name: /revert to last checkpoint/i }),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: /cancel run/i })).toBeDefined();
    expect(
      screen.getByRole('button', { name: /view failure evidence/i }),
    ).toBeDefined();
  });
});
