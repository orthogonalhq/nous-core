// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockUseQuery: ReturnType<typeof vi.fn>;

vi.mock('@nous/transport', () => ({
  trpc: {
    useUtils: vi.fn().mockReturnValue({
      mao: { getControlAuditHistory: { invalidate: vi.fn() } },
    }),
    mao: {
      getControlAuditHistory: {
        useQuery: (...args: any[]) => mockUseQuery(...args),
      },
    },
  },
  useEventSubscription: vi.fn(),
}));

import { MaoAuditTrailPanel } from '../mao-audit-trail-panel';

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

describe('MaoAuditTrailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery = vi.fn().mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders timeline entries with action, actorId, timestamp, and reason', () => {
    mockUseQuery = vi.fn().mockReturnValue({
      data: MOCK_ENTRIES,
      isLoading: false,
      isError: false,
    });

    render(<MaoAuditTrailPanel projectId={MOCK_PROJECT_ID} />);

    expect(screen.getByText('Audit trail')).toBeTruthy();
    expect(screen.getByText('2 entries')).toBeTruthy();
    expect(screen.getByText('hard stop project')).toBeTruthy();
    expect(screen.getByText('resume project')).toBeTruthy();
    expect(screen.getAllByText('principal-operator')).toHaveLength(2);
    expect(screen.getByText('Emergency stop for review')).toBeTruthy();
    expect(screen.getByText('Resume after review complete')).toBeTruthy();
  });

  it('shows empty state when no audit history exists', () => {
    mockUseQuery = vi.fn().mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    render(<MaoAuditTrailPanel projectId={MOCK_PROJECT_ID} />);

    expect(
      screen.getByText('No control actions have been recorded for this project.'),
    ).toBeTruthy();
  });

  it('expands entry details on click showing commandId, resumeReadinessStatus, and decisionRef', () => {
    mockUseQuery = vi.fn().mockReturnValue({
      data: MOCK_ENTRIES,
      isLoading: false,
      isError: false,
    });

    render(<MaoAuditTrailPanel projectId={MOCK_PROJECT_ID} />);

    // Click the first entry to expand
    fireEvent.click(screen.getByText('Emergency stop for review'));

    // Expanded details should now be visible
    expect(screen.getByText('aaaa-bbbb-cccc-dddd-eeeeeeee0001')).toBeTruthy();
    expect(screen.getByText('not_applicable')).toBeTruthy();
    expect(screen.getByText('mao-control:cmd-001')).toBeTruthy();
    expect(screen.getByText('evidence://stop')).toBeTruthy();
  });
});
