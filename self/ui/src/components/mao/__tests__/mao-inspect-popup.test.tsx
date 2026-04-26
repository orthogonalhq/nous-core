// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MaoAgentProjection, MaoProjectSnapshot } from '@nous/shared';
import { MaoServicesProvider } from '../mao-services-context';

// Mock transport
let mockInspectUseQuery: ReturnType<typeof vi.fn>;

vi.mock('@nous/transport', () => ({
  trpc: {
    useUtils: vi.fn().mockReturnValue({
      mao: {
        getControlAuditHistory: { invalidate: vi.fn() },
      },
    }),
    mao: {
      getAgentInspectProjection: {
        useQuery: (...args: any[]) => mockInspectUseQuery(...args),
      },
      getControlAuditHistory: {
        useQuery: vi.fn().mockReturnValue({ data: [], isLoading: false, isError: false }),
      },
    },
  },
  useEventSubscription: vi.fn(),
}));

import { MaoInspectPopup } from '../mao-inspect-popup';

function FakeLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return <a href={href} className={className}>{children}</a>;
}

const mockServices = {
  Link: FakeLink,
  useProject: () => ({ projectId: 'proj-001', setProjectId: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MaoServicesProvider value={mockServices}>{children}</MaoServicesProvider>;
}

function createAgent(
  overrides?: Partial<MaoAgentProjection>,
): MaoAgentProjection {
  return {
    agent_id: 'agent-001',
    project_id: 'project-001',
    dispatching_task_agent_id: null,
    dispatch_origin_ref: 'test',
    state: 'running',
    current_step: 'Execute task',
    progress_percent: 50,
    risk_level: 'low',
    urgency_level: 'normal',
    attention_level: 'normal',
    pfc_alert_status: 'none',
    pfc_mitigation_status: 'none',
    dispatch_state: 'dispatched',
    reflection_cycle_count: 0,
    last_update_at: '2026-03-29T00:00:00Z',
    reasoning_log_preview: null,
    reasoning_log_last_entry_class: null,
    reasoning_log_last_entry_at: null,
    reasoning_log_redaction_state: 'none',
    deepLinks: [],
    evidenceRefs: [],
    ...overrides,
  } as MaoAgentProjection;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInspectUseQuery = vi.fn().mockReturnValue({
    data: null,
    isLoading: false,
  });
});

afterEach(() => {
  cleanup();
});

describe('MaoInspectPopup', () => {
  it('renders popup when open=true with data-testid', () => {
    const agent = createAgent();

    render(
      <Wrapper>
        <MaoInspectPopup
          open={true}
          onClose={vi.fn()}
          agent={agent}
          projectSnapshot={null}
        />
      </Wrapper>,
    );

    expect(screen.getByTestId('inspect-popup')).toBeTruthy();
  });

  it('does not render when open=false', () => {
    render(
      <Wrapper>
        <MaoInspectPopup
          open={false}
          onClose={vi.fn()}
          agent={null}
          projectSnapshot={null}
        />
      </Wrapper>,
    );

    expect(screen.queryByTestId('inspect-popup')).toBeNull();
  });

  it('fires onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    const agent = createAgent();

    render(
      <Wrapper>
        <MaoInspectPopup
          open={true}
          onClose={handleClose}
          agent={agent}
          projectSnapshot={null}
        />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('inspect-popup-close'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose on Escape key', () => {
    const handleClose = vi.fn();
    const agent = createAgent();

    render(
      <Wrapper>
        <MaoInspectPopup
          open={true}
          onClose={handleClose}
          agent={agent}
          projectSnapshot={null}
        />
      </Wrapper>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose on backdrop click', () => {
    const handleClose = vi.fn();
    const agent = createAgent();

    render(
      <Wrapper>
        <MaoInspectPopup
          open={true}
          onClose={handleClose}
          agent={agent}
          projectSnapshot={null}
        />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('inspect-popup-backdrop'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('renders MaoInspectPanel inside popup', () => {
    const agent = createAgent();

    render(
      <Wrapper>
        <MaoInspectPopup
          open={true}
          onClose={vi.fn()}
          agent={agent}
          projectSnapshot={null}
        />
      </Wrapper>,
    );

    // MaoInspectPanel renders "Inspect panel" as its card title
    expect(screen.getByText('Inspect panel')).toBeTruthy();
  });

  it('renders audit trail panel inside popup', () => {
    const agent = createAgent();

    render(
      <Wrapper>
        <MaoInspectPopup
          open={true}
          onClose={vi.fn()}
          agent={agent}
          projectSnapshot={null}
        />
      </Wrapper>,
    );

    expect(screen.getByText('Audit trail')).toBeTruthy();
  });
});

/**
 * UT-SP13-POPUP-* — SP 13 polish coverage on inspect-popup.
 *
 * Per SDS § Invariants SUPV-SP13-024 + SUPV-SP13-025 + SUPV-SP13-026; Goals
 * SC-18 / SC-19 / SC-20 / SC-21.
 */
describe('UT-SP13-POPUP — SP 13 polish coverage', () => {
  it('UT-SP13-POPUP-MOTION-REDUCED — popup CSS rule wraps motion-suppression under prefers-reduced-motion: reduce', () => {
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

    const agent = createAgent();
    const { container } = render(
      <Wrapper>
        <MaoInspectPopup open={true} onClose={vi.fn()} agent={agent} projectSnapshot={null} />
      </Wrapper>,
    );

    const styleNode = container.querySelector('style[data-style-id="mao-inspect-popup-motion"]');
    expect(styleNode).toBeTruthy();
    const css = styleNode?.textContent ?? '';
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: none/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transform: none/);
  });

  it('UT-SP13-POPUP-FOCUS — popup container is programmatically focused on open', () => {
    const agent = createAgent();
    const { rerender } = render(
      <Wrapper>
        <MaoInspectPopup open={false} onClose={vi.fn()} agent={agent} projectSnapshot={null} />
      </Wrapper>,
    );

    rerender(
      <Wrapper>
        <MaoInspectPopup open={true} onClose={vi.fn()} agent={agent} projectSnapshot={null} />
      </Wrapper>,
    );

    const container = screen.getByTestId('inspect-popup-container');
    // Container has tabIndex={-1} for programmatic focus.
    expect(container.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(container);
  });

  it('UT-SP13-POPUP-SUP-PRESENT — supervisor-state header renders worst-severity chip when at least one supervisor field is present', () => {
    const agent = createAgent({
      guardrail_status: 'enforced' as any,
    });

    render(
      <Wrapper>
        <MaoInspectPopup open={true} onClose={vi.fn()} agent={agent} projectSnapshot={null} />
      </Wrapper>,
    );

    const header = screen.getByTestId('mao-supervisor-header');
    expect(header).toBeTruthy();
    expect(header.getAttribute('data-mao-severity')).toBe('critical');
    expect(header.textContent).toMatch(/Supervisor state: critical/);
  });

  it('UT-SP13-POPUP-SUP-PRESENT-ORDERED — worst-severity (critical > high > medium > low) selected from mixed supervisor fields', () => {
    const agent = createAgent({
      guardrail_status: 'clear' as any, // low
      witness_integrity_status: 'degraded' as any, // medium
      sentinel_risk_score: 0.8 as any, // critical (band [0.75, 1.0])
    });

    render(
      <Wrapper>
        <MaoInspectPopup open={true} onClose={vi.fn()} agent={agent} projectSnapshot={null} />
      </Wrapper>,
    );

    const header = screen.getByTestId('mao-supervisor-header');
    // Worst is critical (sentinel 0.8 → critical band).
    expect(header.getAttribute('data-mao-severity')).toBe('critical');
  });

  it('UT-SP13-POPUP-SUP-ABSENT — no supervisor header DOM when all three supervisor fields are absent', () => {
    const agent = createAgent();

    render(
      <Wrapper>
        <MaoInspectPopup open={true} onClose={vi.fn()} agent={agent} projectSnapshot={null} />
      </Wrapper>,
    );

    expect(screen.queryByTestId('mao-supervisor-header')).toBeNull();
    expect(screen.queryByText(/Supervisor state:/)).toBeNull();
    // Placeholder absence assertions per SC-39 mirror.
    expect(screen.queryByText('N/A')).toBeNull();
    expect(screen.queryByText('Unknown')).toBeNull();
  });

  /**
   * SP 15 — UT-SP15-INSP-MATRIX (popup variant, SUPV-SP15-001).
   *
   * Closed-product `it.each` over the supervisor-field × severity-band
   * domain. Asserts the popup header `data-mao-severity` resolves to the
   * SP 13 closed-form severity token for each single-field fixture.
   */
  it.each([
    { status: 'clear', severity: 'low' },
    { status: 'warning', severity: 'medium' },
    { status: 'violation', severity: 'high' },
    { status: 'enforced', severity: 'critical' },
  ] as const)(
    'UT-SP15-INSP-MATRIX-POPUP-GUARDRAIL — guardrail_status=$status header severity=$severity',
    ({ status, severity }) => {
      const agent = createAgent({ guardrail_status: status as any });
      render(
        <Wrapper>
          <MaoInspectPopup open={true} onClose={vi.fn()} agent={agent} projectSnapshot={null} />
        </Wrapper>,
      );
      const header = screen.getByTestId('mao-supervisor-header');
      expect(header.getAttribute('data-mao-severity')).toBe(severity);
    },
  );

  it.each([
    { status: 'intact', severity: 'low' },
    { status: 'degraded', severity: 'medium' },
    { status: 'broken', severity: 'high' },
  ] as const)(
    'UT-SP15-INSP-MATRIX-POPUP-WITNESS — witness_integrity_status=$status header severity=$severity',
    ({ status, severity }) => {
      const agent = createAgent({ witness_integrity_status: status as any });
      render(
        <Wrapper>
          <MaoInspectPopup open={true} onClose={vi.fn()} agent={agent} projectSnapshot={null} />
        </Wrapper>,
      );
      const header = screen.getByTestId('mao-supervisor-header');
      expect(header.getAttribute('data-mao-severity')).toBe(severity);
    },
  );

  it.each([
    { score: 0.1, severity: 'low' },
    { score: 0.4, severity: 'medium' },
    { score: 0.7, severity: 'high' },
    { score: 0.95, severity: 'critical' },
  ] as const)(
    'UT-SP15-INSP-MATRIX-POPUP-SENTINEL — sentinel_risk_score=$score header severity=$severity',
    ({ score, severity }) => {
      const agent = createAgent({ sentinel_risk_score: score as any });
      render(
        <Wrapper>
          <MaoInspectPopup open={true} onClose={vi.fn()} agent={agent} projectSnapshot={null} />
        </Wrapper>,
      );
      const header = screen.getByTestId('mao-supervisor-header');
      expect(header.getAttribute('data-mao-severity')).toBe(severity);
    },
  );

  it('UT-SP13-POPUP-DNR-C3 — SP 13 polish itself adds no destructive control to the popup (supervisor-state header is read-only)', () => {
    /*
     * DNR-C3 invariant binding: SP 13 polish must not introduce any NEW
     * destructive control surface to the popup. The existing
     * `MaoProjectControls` path (mounted from the operating surface via
     * `onRequestControl`) is preserved per DNR-F1 — its presence is verified
     * by `mao-page.test.tsx § submits governed project controls` and by the
     * `MaoProjectControls` component test suite. This test verifies that
     * SP 13's NEW additions (supervisor-state header at SUPV-SP13-025) carry
     * no destructive role/button — the header is read-only.
     */
    const agent = createAgent({
      guardrail_status: 'enforced' as any,
    });

    render(
      <Wrapper>
        <MaoInspectPopup
          open={true}
          onClose={vi.fn()}
          agent={agent}
          projectSnapshot={null}
        />
      </Wrapper>,
    );

    // Supervisor header IS rendered (severity-routed) and does NOT contain
    // any button or role-actionable element.
    const header = screen.getByTestId('mao-supervisor-header');
    expect(header).toBeTruthy();
    // Header subtree contains no <button> or role=button.
    expect(header.querySelector('button')).toBeNull();
    expect(header.querySelector('[role="button"]')).toBeNull();
  });
});
