// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../hooks/useEventSubscription', () => ({
  useEventSubscription: vi.fn(),
}));

import { MaoAuditTrailPanel } from '../mao-audit-trail-panel';
import { MaoServicesProvider } from '../mao-services-context';
import type { MaoServicesContextValue } from '../mao-services-context';

const MOCK_PROJECT_ID = '550e8400-e29b-41d4-a716-446655445001' as any;

const MOCK_ENTRIES = [
  {
    commandId: 'aaaa-bbbb-cccc-dddd-eeeeeeee0001',
    action: 'hard_stop_project',
    actorId: 'principal-operator',
    reason: 'Emergency stop for review',
    reasonCode: 'mao_project_control_applied',
    at: '2026-03-10T01:00:00.000Z',
    evidenceRefs: ['evidence://stop'],
    resumeReadinessStatus: 'not_applicable',
    decisionRef: 'mao-control:cmd-001',
  },
  {
    commandId: 'aaaa-bbbb-cccc-dddd-eeeeeeee0002',
    action: 'resume_project',
    actorId: 'principal-operator',
    reason: 'Resume after review complete',
    reasonCode: 'mao_project_control_applied',
    at: '2026-03-10T02:00:00.000Z',
    evidenceRefs: ['evidence://resume'],
    resumeReadinessStatus: 'passed',
    decisionRef: 'mao-control:cmd-002',
  },
];

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

describe('MaoAuditTrailPanel', () => {
  let mockServices: MaoServicesContextValue;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServices = createMockServices();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders timeline entries with action, actorId, timestamp, and reason', () => {
    mockServices = createMockServices({
      useAuditQuery: vi.fn().mockReturnValue({
        data: MOCK_ENTRIES,
        isLoading: false,
        isError: false,
      }),
    });

    render(
      <MaoServicesProvider value={mockServices}>
        <MaoAuditTrailPanel projectId={MOCK_PROJECT_ID} />
      </MaoServicesProvider>,
    );

    expect(screen.getByText('Audit trail')).toBeTruthy();
    expect(screen.getByText('2 entries')).toBeTruthy();
    expect(screen.getByText('hard stop project')).toBeTruthy();
    expect(screen.getByText('resume project')).toBeTruthy();
    expect(screen.getAllByText('principal-operator')).toHaveLength(2);
    expect(screen.getByText('Emergency stop for review')).toBeTruthy();
    expect(screen.getByText('Resume after review complete')).toBeTruthy();
  });

  it('shows empty state when no audit history exists', () => {
    mockServices = createMockServices({
      useAuditQuery: vi.fn().mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      }),
    });

    render(
      <MaoServicesProvider value={mockServices}>
        <MaoAuditTrailPanel projectId={MOCK_PROJECT_ID} />
      </MaoServicesProvider>,
    );

    expect(
      screen.getByText('No control actions have been recorded for this project.'),
    ).toBeTruthy();
  });

  it('expands entry details on click showing commandId, resumeReadinessStatus, and decisionRef', () => {
    mockServices = createMockServices({
      useAuditQuery: vi.fn().mockReturnValue({
        data: MOCK_ENTRIES,
        isLoading: false,
        isError: false,
      }),
    });

    render(
      <MaoServicesProvider value={mockServices}>
        <MaoAuditTrailPanel projectId={MOCK_PROJECT_ID} />
      </MaoServicesProvider>,
    );

    // Click the first entry to expand
    fireEvent.click(screen.getByText('Emergency stop for review'));

    // Expanded details should now be visible
    expect(screen.getByText('aaaa-bbbb-cccc-dddd-eeeeeeee0001')).toBeTruthy();
    expect(screen.getByText('not_applicable')).toBeTruthy();
    expect(screen.getByText('mao-control:cmd-001')).toBeTruthy();
    expect(screen.getByText('evidence://stop')).toBeTruthy();
  });
});
