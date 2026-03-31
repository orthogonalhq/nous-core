// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MaoT3ConfirmationDialog } from '../mao-t3-confirmation-dialog';

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
