// @vitest-environment jsdom

import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { RecoveryStateBanner } from '../recovery-state-banner';
import { recoveryCompletedFixture } from './fixtures/recovery-terminal-state-fixtures';

/**
 * UT-SP10-BANNER-* — `RecoveryStateBanner` component tests.
 *
 * Per SDS § Invariants SUPV-SP10-001 + SUPV-SP10-005 + SUPV-SP10-015 +
 * SUPV-SP10-020. Four tests covering: render, UI-local dismissal (no opctl
 * side effect), host-callback run-detail link, reduced-motion accessibility.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RecoveryStateBanner (SP 10)', () => {
  it('UT-SP10-BANNER-RENDER — renders the outcome summary and dismiss control', () => {
    render(<RecoveryStateBanner fixture={recoveryCompletedFixture} />);
    expect(
      screen.getByText(recoveryCompletedFixture.outcomeSummary),
    ).toBeDefined();
    expect(
      screen.getByRole('button', {
        name: /dismiss recovery success banner/i,
      }),
    ).toBeDefined();
    // No `onOpenRunDetail` provided -> the run-detail button must be absent.
    expect(screen.queryByRole('button', { name: /view run detail/i })).toBeNull();
  });

  it('UT-SP10-BANNER-DISMISS-LOCAL — dismissal toggles UI-local state with no side effects', () => {
    const onOpenRunDetail = vi.fn();
    const { container } = render(
      <RecoveryStateBanner
        fixture={recoveryCompletedFixture}
        onOpenRunDetail={onOpenRunDetail}
      />,
    );
    expect(
      screen.getByText(recoveryCompletedFixture.outcomeSummary),
    ).toBeDefined();

    fireEvent.click(
      screen.getByRole('button', { name: /dismiss recovery success banner/i }),
    );

    // Banner removes itself; container body is empty.
    expect(container.firstChild).toBeNull();
    // No opctl/proof side effect was invoked as part of dismissal.
    expect(onOpenRunDetail).not.toHaveBeenCalled();
  });

  it('UT-SP10-BANNER-RUN-DETAIL — clicking the run-detail link calls the host handler with runId', () => {
    const onOpenRunDetail = vi.fn();
    render(
      <RecoveryStateBanner
        fixture={recoveryCompletedFixture}
        onOpenRunDetail={onOpenRunDetail}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /view run detail/i }));

    expect(onOpenRunDetail).toHaveBeenCalledTimes(1);
    expect(onOpenRunDetail).toHaveBeenCalledWith(recoveryCompletedFixture.runId);
  });

  it('UT-SP10-BANNER-REDUCED-MOTION — banner remains accessible under prefers-reduced-motion: reduce', () => {
    // Mirror panel-bridge-host.ts:39-41 matchMedia precedent shape.
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

    render(<RecoveryStateBanner fixture={recoveryCompletedFixture} />);

    const dismissButton = screen.getByRole('button', {
      name: /dismiss recovery success banner/i,
    });
    expect(dismissButton).toBeDefined();
    // accessible name + focusable (button defaults to tabIndex 0).
    expect(dismissButton.getAttribute('aria-label')).toContain('Dismiss');
  });
});
