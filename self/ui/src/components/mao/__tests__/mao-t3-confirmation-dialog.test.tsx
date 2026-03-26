// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MaoT3ConfirmationDialog } from '../mao-t3-confirmation-dialog';
import { MaoServicesProvider } from '../mao-services-context';
import type { MaoServicesContextValue } from '../mao-services-context';

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

function createMockServices(overrides?: Partial<MaoServicesContextValue>): MaoServicesContextValue {
  return {
    useSnapshotQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: false, isError: false }),
    useInspectQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: false, isError: false }),
    useAuditQuery: vi.fn().mockReturnValue({ data: [], isLoading: false, isError: false }),
    useSystemStatusQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: false, isError: false }),
    useControlMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), data: undefined, isPending: false, isError: false }),
    useProofMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), data: undefined, isPending: false, isError: false }),
    useInvalidation: vi.fn().mockReturnValue({
      snapshotInvalidate: { invalidate: vi.fn() },
      inspectInvalidate: { invalidate: vi.fn() },
      controlProjectionInvalidate: { invalidate: vi.fn() },
      auditInvalidate: { invalidate: vi.fn() },
      systemStatusInvalidate: { invalidate: vi.fn() },
      dashboardInvalidate: { invalidate: vi.fn() },
      escalationsInvalidate: { invalidate: vi.fn() },
    }),
    Link: ({ href, className, children }) => React.createElement('a', { href, className }, children),
    useProject: vi.fn().mockReturnValue({ projectId: null, setProjectId: vi.fn() }),
    useSearchParams: vi.fn().mockReturnValue({ get: () => null }),
    ...overrides,
  };
}

describe('MaoT3ConfirmationDialog', () => {
  let mutate: ReturnType<typeof vi.fn>;
  let mockServices: MaoServicesContextValue;

  beforeEach(() => {
    vi.clearAllMocks();
    mutate = vi.fn();
    mockServices = createMockServices({
      useProofMutation: vi.fn().mockReturnValue({
        mutate,
        isPending: false,
        isError: false,
      }),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders dialog with action summary when open', () => {
    render(
      <MaoServicesProvider value={mockServices}>
        <MaoT3ConfirmationDialog
          open={true}
          action="resume_project"
          projectId={MOCK_PROJECT_ID}
          projectName="Test Project"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </MaoServicesProvider>,
    );

    expect(screen.getByText('Confirm T3 action')).toBeTruthy();
    expect(screen.getByText('resume project')).toBeTruthy();
    expect(screen.getByText('Test Project')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('calls requestConfirmationProof mutation on confirm and invokes onConfirm with proof', async () => {
    const onConfirm = vi.fn();

    // Simulate mutation that calls onSuccess
    mockServices = createMockServices({
      useProofMutation: vi.fn().mockImplementation(
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
      ),
    });

    render(
      <MaoServicesProvider value={mockServices}>
        <MaoT3ConfirmationDialog
          open={true}
          action="resume_project"
          projectId={MOCK_PROJECT_ID}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />
      </MaoServicesProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(MOCK_PROOF);
    });
  });

  it('calls onCancel without mutation when cancel button is clicked', () => {
    const onCancel = vi.fn();

    render(
      <MaoServicesProvider value={mockServices}>
        <MaoT3ConfirmationDialog
          open={true}
          action="hard_stop_project"
          projectId={MOCK_PROJECT_ID}
          onConfirm={vi.fn()}
          onCancel={onCancel}
        />
      </MaoServicesProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('dismisses dialog on Escape key', () => {
    const onCancel = vi.fn();

    render(
      <MaoServicesProvider value={mockServices}>
        <MaoT3ConfirmationDialog
          open={true}
          action="resume_project"
          projectId={MOCK_PROJECT_ID}
          onConfirm={vi.fn()}
          onCancel={onCancel}
        />
      </MaoServicesProvider>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalled();
  });

  it('does not render when open is false', () => {
    render(
      <MaoServicesProvider value={mockServices}>
        <MaoT3ConfirmationDialog
          open={false}
          action="resume_project"
          projectId={MOCK_PROJECT_ID}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </MaoServicesProvider>,
    );

    expect(screen.queryByText('Confirm T3 action')).toBeNull();
  });

  it('disables confirm button during loading state', () => {
    mockServices = createMockServices({
      useProofMutation: vi.fn().mockReturnValue({
        mutate,
        isPending: true,
        isError: false,
      }),
    });

    render(
      <MaoServicesProvider value={mockServices}>
        <MaoT3ConfirmationDialog
          open={true}
          action="resume_project"
          projectId={MOCK_PROJECT_ID}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </MaoServicesProvider>,
    );

    const confirmButton = screen.getByRole('button', { name: 'Confirming...' });
    expect(confirmButton).toBeTruthy();
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);
  });
});
