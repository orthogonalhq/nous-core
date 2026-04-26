// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MaoT3ConfirmationDialog,
  RATIONALE_COPY,
  resolveRationaleCopy,
  type RationaleKey,
} from '../mao-t3-confirmation-dialog';

const MOCK_PROJECT_ID = '550e8400-e29b-41d4-a716-446655445001' as any;

const MOCK_PROOF = {
  proof_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  issued_at: '2026-03-10T01:00:00.000Z',
  expires_at: '2026-03-10T02:00:00.000Z',
  scope_hash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  action: 'resume' as const,
  tier: 'T3' as const,
  signature: 'mock-sig',
};

let mockMutate: ReturnType<typeof vi.fn>;
let mockUseMutation: ReturnType<typeof vi.fn>;

vi.mock('@nous/transport', () => ({
  trpc: {
    opctl: {
      requestConfirmationProof: {
        useMutation: (...args: any[]) => mockUseMutation(...args),
      },
    },
  },
}));

describe('MaoT3ConfirmationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate = vi.fn();
    mockUseMutation = vi.fn().mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders dialog with action summary when open', () => {
    render(
      <MaoT3ConfirmationDialog
        open={true}
        action="resume_project"
        projectId={MOCK_PROJECT_ID}
        projectName="Test Project"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Confirm T3 action')).toBeTruthy();
    expect(screen.getByText('resume project')).toBeTruthy();
    expect(screen.getByText('Test Project')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('calls requestConfirmationProof mutation on confirm and invokes onConfirm with proof after Done click', async () => {
    const onConfirm = vi.fn();

    // Simulate mutation that calls onSuccess
    mockUseMutation = vi.fn().mockImplementation(
      (opts?: { onSuccess?: (proof: any) => void }) => ({
        mutate: (input: any) => {
          // Verify the mutation input shape
          expect(input.scope.class).toBe('project_run_scope');
          expect(input.scope.kind).toBe('project_run');
          expect(input.scope.project_id).toBe(MOCK_PROJECT_ID);
          expect(input.action).toBe('resume');
          expect(input.tier).toBe('T3');
          // Invoke onSuccess callback with mock proof
          opts?.onSuccess?.(MOCK_PROOF);
        },
        isPending: false,
        isError: false,
      }),
    );

    render(
      <MaoT3ConfirmationDialog
        open={true}
        action="resume_project"
        projectId={MOCK_PROJECT_ID}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    // Click Confirm to obtain proof
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    // Proof details should be displayed before onConfirm is called
    await waitFor(() => {
      expect(screen.getByTestId('proof-details')).toBeTruthy();
      expect(screen.getByTestId('proof-id').textContent).toBe(MOCK_PROOF.proof_id);
    });

    // onConfirm should NOT have been called yet
    expect(onConfirm).not.toHaveBeenCalled();

    // Click Done to execute
    fireEvent.click(screen.getByTestId('proof-done-button'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(MOCK_PROOF);
    });
  });

  it('calls onCancel without mutation when cancel button is clicked', () => {
    const onCancel = vi.fn();

    render(
      <MaoT3ConfirmationDialog
        open={true}
        action="hard_stop_project"
        projectId={MOCK_PROJECT_ID}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('dismisses dialog on Escape key', () => {
    const onCancel = vi.fn();

    render(
      <MaoT3ConfirmationDialog
        open={true}
        action="resume_project"
        projectId={MOCK_PROJECT_ID}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalled();
  });

  it('does not render when open is false', () => {
    render(
      <MaoT3ConfirmationDialog
        open={false}
        action="resume_project"
        projectId={MOCK_PROJECT_ID}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByText('Confirm T3 action')).toBeNull();
  });

  it('disables confirm button during loading state', () => {
    mockUseMutation = vi.fn().mockReturnValue({
      mutate: mockMutate,
      isPending: true,
      isError: false,
    });

    render(
      <MaoT3ConfirmationDialog
        open={true}
        action="resume_project"
        projectId={MOCK_PROJECT_ID}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const confirmButton = screen.getByRole('button', { name: 'Confirming...' });
    expect(confirmButton).toBeTruthy();
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('displays proof details after mutation success before calling onConfirm', async () => {
    const onConfirm = vi.fn();

    mockUseMutation = vi.fn().mockImplementation(
      (opts?: { onSuccess?: (proof: any) => void }) => ({
        mutate: () => {
          opts?.onSuccess?.(MOCK_PROOF);
        },
        isPending: false,
        isError: false,
      }),
    );

    render(
      <MaoT3ConfirmationDialog
        open={true}
        action="hard_stop_project"
        projectId={MOCK_PROJECT_ID}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(screen.getByText('Proof confirmed')).toBeTruthy();
      expect(screen.getByTestId('proof-id').textContent).toBe(MOCK_PROOF.proof_id);
    });

    // onConfirm should not have been called yet
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm with proof when Done button is clicked after proof display', async () => {
    const onConfirm = vi.fn();

    mockUseMutation = vi.fn().mockImplementation(
      (opts?: { onSuccess?: (proof: any) => void }) => ({
        mutate: () => {
          opts?.onSuccess?.(MOCK_PROOF);
        },
        isPending: false,
        isError: false,
      }),
    );

    render(
      <MaoT3ConfirmationDialog
        open={true}
        action="resume_project"
        projectId={MOCK_PROJECT_ID}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(screen.getByTestId('proof-done-button')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('proof-done-button'));

    expect(onConfirm).toHaveBeenCalledWith(MOCK_PROOF);
  });

  it('resets proof display state when dialog re-opens', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    mockUseMutation = vi.fn().mockImplementation(
      (opts?: { onSuccess?: (proof: any) => void }) => ({
        mutate: () => {
          opts?.onSuccess?.(MOCK_PROOF);
        },
        isPending: false,
        isError: false,
      }),
    );

    const { rerender } = render(
      <MaoT3ConfirmationDialog
        open={true}
        action="resume_project"
        projectId={MOCK_PROJECT_ID}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    // Trigger confirm to show proof
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(screen.getByText('Proof confirmed')).toBeTruthy();
    });

    // Close the dialog
    rerender(
      <MaoT3ConfirmationDialog
        open={false}
        action="resume_project"
        projectId={MOCK_PROJECT_ID}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    // Re-open the dialog
    rerender(
      <MaoT3ConfirmationDialog
        open={true}
        action="resume_project"
        projectId={MOCK_PROJECT_ID}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    // Should show the confirmation view, not the proof display
    expect(screen.getByText('Confirm T3 action')).toBeTruthy();
    expect(screen.queryByText('Proof confirmed')).toBeNull();
  });
});

// --- WR-162 SP 14 (SUPV-SP14-008..013) — T3 dialog metadata refactor ---

describe('UT-SP14-T3 — T3 dialog metadata refactor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate = vi.fn();
    mockUseMutation = vi.fn().mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  // UT-SP14-T3-LABEL-THREAD — display.label threads into render output
  it('UT-SP14-T3-LABEL-THREAD — getTierDisplay("T3").label "Cooldown-gated" renders', () => {
    render(
      <MaoT3ConfirmationDialog
        open={true}
        action="resume_project"
        projectId={MOCK_PROJECT_ID}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const label = screen.getByTestId('t3-tier-label');
    expect(label.textContent).toBe('Cooldown-gated');
    expect(label.getAttribute('data-tier-level')).toBe('T3');
    expect(label.getAttribute('data-tier-severity')).toBe('critical');
  });

  // UT-SP14-T3-SEVERITY-TOKEN — replaces inline '#ef4444' with SP 13 CSS-var
  it('UT-SP14-T3-SEVERITY-TOKEN — heading + tier label use SP 13 CSS-var, not "#ef4444"', () => {
    render(
      <MaoT3ConfirmationDialog
        open={true}
        action="hard_stop_project"
        projectId={MOCK_PROJECT_ID}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const heading = screen.getByText('Confirm T3 action');
    const headingStyle = heading.getAttribute('style') ?? '';
    expect(headingStyle).toContain('var(--nous-alert-critical)');
    expect(headingStyle.toLowerCase()).not.toContain('#ef4444');
  });

  // UT-SP14-T3-METADATA-CALL — display surface anchored on tier metadata
  it('UT-SP14-T3-METADATA-CALL — render reads getTierDisplay("T3") shape (label + severity + rationaleKey)', () => {
    render(
      <MaoT3ConfirmationDialog
        open={true}
        action="resume_project"
        projectId={MOCK_PROJECT_ID}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const label = screen.getByTestId('t3-tier-label');
    const rationale = screen.getByTestId('t3-rationale-copy');
    expect(label.getAttribute('data-tier-level')).toBe('T3');
    expect(rationale.getAttribute('data-rationale-key')).toBe('tier.t3.rationale');
  });

  // UT-SP14-T3-SUPERVISOR-RATIONALE — supervisor-locked variant
  it('UT-SP14-T3-SUPERVISOR-RATIONALE — supervisor-locked renders the ESC-001 acknowledgment copy', () => {
    render(
      <MaoT3ConfirmationDialog
        open={true}
        action="hard_stop_project"
        projectId={MOCK_PROJECT_ID}
        supervisorLocked={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const rationale = screen.getByTestId('t3-rationale-copy');
    expect(rationale.getAttribute('data-supervisor-locked')).toBe('true');
    expect(rationale.textContent).toContain('Supervisor lock active');
    expect(rationale.textContent).toContain('ESC-001');
  });

  // UT-SP14-T3-RATIONALE-DEFAULT — supervisorLocked omitted == false
  it('UT-SP14-T3-RATIONALE-DEFAULT — without supervisorLocked, the standard rationale copy renders', () => {
    render(
      <MaoT3ConfirmationDialog
        open={true}
        action="resume_project"
        projectId={MOCK_PROJECT_ID}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const rationale = screen.getByTestId('t3-rationale-copy');
    expect(rationale.getAttribute('data-supervisor-locked')).toBe('false');
    expect(rationale.textContent).toContain('Cooldown-gated');
  });

  // UT-SP14-T3-COOLDOWN-V1 — countdown not rendered when T3_COOLDOWN_MS === 0
  it('UT-SP14-T3-COOLDOWN-V1 — no cooldown countdown rendered at V1 (T3_COOLDOWN_MS === 0)', () => {
    render(
      <MaoT3ConfirmationDialog
        open={true}
        action="resume_project"
        projectId={MOCK_PROJECT_ID}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('t3-cooldown')).toBeNull();
  });

  // UT-SP14-T3-IMPACT-SUMMARY — closes Goals N4 (impact-summary block preserved)
  it('UT-SP14-T3-IMPACT-SUMMARY — impactSummary block continues to render under fixture', () => {
    render(
      <MaoT3ConfirmationDialog
        open={true}
        action="resume_project"
        projectId={MOCK_PROJECT_ID}
        impactSummary={{
          activeRunCount: 2,
          activeAgentCount: 5,
          blockedAgentCount: 1,
          urgentAgentCount: 0,
        }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('active runs: 2')).toBeTruthy();
    expect(screen.getByText('active agents: 5')).toBeTruthy();
    expect(screen.getByText('blocked agents: 1')).toBeTruthy();
    expect(screen.getByText('urgent agents: 0')).toBeTruthy();
  });

  // UT-SP14-T3-REASON-CODE — reason-code block renders when result.reason_code present
  it('UT-SP14-T3-REASON-CODE — reason-code surface renders when result.reason_code is provided', () => {
    render(
      <MaoT3ConfirmationDialog
        open={true}
        action="resume_project"
        projectId={MOCK_PROJECT_ID}
        result={{ reason_code: 'OPCTL-003' }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const reasonBlock = screen.getByTestId('t3-reason-code');
    expect(reasonBlock).toBeTruthy();
    expect(reasonBlock.textContent).toContain('OPCTL-003');
  });

  // UT-SP14-T3-REASON-CODE-ABSENT
  it('UT-SP14-T3-REASON-CODE-ABSENT — reason-code surface absent when result.reason_code undefined', () => {
    render(
      <MaoT3ConfirmationDialog
        open={true}
        action="resume_project"
        projectId={MOCK_PROJECT_ID}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('t3-reason-code')).toBeNull();
  });

  // UT-SP14-DNR-H1 — proof-flow state machine intact
  it('UT-SP14-DNR-H1 — proof-flow state machine: mutate → confirmedProof → Done', async () => {
    const onConfirm = vi.fn();
    mockUseMutation = vi.fn().mockImplementation(
      (opts?: { onSuccess?: (proof: any) => void }) => ({
        mutate: () => opts?.onSuccess?.(MOCK_PROOF),
        isPending: false,
        isError: false,
      }),
    );
    render(
      <MaoT3ConfirmationDialog
        open={true}
        action="hard_stop_project"
        projectId={MOCK_PROJECT_ID}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(screen.getByTestId('proof-done-button')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('proof-done-button'));
    expect(onConfirm).toHaveBeenCalledWith(MOCK_PROOF);
  });

  // UT-SP14-DNR-H2 — four data-testid anchors resolve
  it('UT-SP14-DNR-H2 — t3-confirmation-dialog + proof-details + proof-id + proof-done-button anchors resolve', async () => {
    mockUseMutation = vi.fn().mockImplementation(
      (opts?: { onSuccess?: (proof: any) => void }) => ({
        mutate: () => opts?.onSuccess?.(MOCK_PROOF),
        isPending: false,
        isError: false,
      }),
    );
    render(
      <MaoT3ConfirmationDialog
        open={true}
        action="resume_project"
        projectId={MOCK_PROJECT_ID}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('t3-confirmation-dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(screen.getByTestId('proof-details')).toBeTruthy();
      expect(screen.getByTestId('proof-id')).toBeTruthy();
      expect(screen.getByTestId('proof-done-button')).toBeTruthy();
    });
  });
});

describe('UT-SP14-T3 — RationaleKey closed Record', () => {
  // UT-SP14-CAT-RATIONALE-KEY — closed Record exhaustiveness
  it('UT-SP14-CAT-RATIONALE-KEY — RATIONALE_COPY admits exactly five RationaleKey literals', () => {
    const expected: RationaleKey[] = [
      'tier.t0.rationale',
      'tier.t1.rationale',
      'tier.t2.rationale',
      'tier.t3.rationale',
      'tier.t3.supervisor_locked',
    ];
    expect(Object.keys(RATIONALE_COPY).sort()).toEqual([...expected].sort());
    for (const key of expected) {
      expect(typeof RATIONALE_COPY[key]).toBe('string');
      expect(RATIONALE_COPY[key].length).toBeGreaterThan(0);
    }
  });

  // resolveRationaleCopy contract
  it('resolveRationaleCopy — supervisor-locked rewrites tier.t3.rationale only', () => {
    expect(resolveRationaleCopy('tier.t3.rationale', false)).toBe(
      RATIONALE_COPY['tier.t3.rationale'],
    );
    expect(resolveRationaleCopy('tier.t3.rationale', true)).toBe(
      RATIONALE_COPY['tier.t3.supervisor_locked'],
    );
    // Non-T3 keys do NOT get rewritten when supervisorLocked === true.
    expect(resolveRationaleCopy('tier.t1.rationale', true)).toBe(
      RATIONALE_COPY['tier.t1.rationale'],
    );
  });
});

/**
 * SP 15 — UT-SP15-T3-MATRIX (SUPV-SP15-003).
 *
 * Closed-enum `it.each` over all four `ConfirmationTier` literals plus one
 * supervisor-rationale-key cell. Per `feedback_no_heuristic_bandaids.md`:
 * the matrix iterates over `getTierDisplay` arms; cells assert the
 * `display.label` thread + `display.severity` token + rationale-key
 * resolution from the same closed-form source-of-truth.
 *
 * Existing UT-SP14-DNR-H1 / UT-SP14-DNR-H2 are NOT modified.
 */
import { getTierDisplay } from '@nous/subcortex-opctl';

const T3_MATRIX_TIERS = ['T0', 'T1', 'T2', 'T3'] as const;

describe('UT-SP15-T3-MATRIX — ConfirmationTier closed-enum cell coverage', () => {
  it.each(T3_MATRIX_TIERS)(
    'UT-SP15-T3-MATRIX-%s — getTierDisplay returns label + severity + rationaleKey for tier %s',
    (tier) => {
      const display = getTierDisplay(tier);
      expect(display.level).toBe(tier);
      expect(typeof display.label).toBe('string');
      expect(display.label.length).toBeGreaterThan(0);
      expect(['low', 'medium', 'high', 'critical']).toContain(display.severity);
      // Rationale-key resolution flows through the SP 14 closed map.
      expect(typeof display.rationaleKey).toBe('string');
      // The rationaleKey is admitted by RATIONALE_COPY as a RationaleKey OR as
      // a base SP 7 stub; for SP 15 we assert the four base keys resolve.
      const baseKey = display.rationaleKey as RationaleKey;
      if (
        baseKey === 'tier.t0.rationale' ||
        baseKey === 'tier.t1.rationale' ||
        baseKey === 'tier.t2.rationale' ||
        baseKey === 'tier.t3.rationale'
      ) {
        expect(RATIONALE_COPY[baseKey]).toBeDefined();
      }
    },
  );

  it('UT-SP15-T3-MATRIX-SUPERVISOR-LOCKED — supervisor-rationale-key cell resolves through closed map', () => {
    // Supervisor-locked routing is keyed off the tier.t3.rationale stub; the
    // closed `RATIONALE_COPY['tier.t3.supervisor_locked']` admits the
    // five-literal RationaleKey set.
    const supervisorRoute = resolveRationaleCopy('tier.t3.rationale', true);
    expect(supervisorRoute).toBe(RATIONALE_COPY['tier.t3.supervisor_locked']);
    expect(supervisorRoute.length).toBeGreaterThan(0);
  });
});
