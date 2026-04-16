// @vitest-environment jsdom

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NotificationRecord } from '@nous/shared';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockListQuery = vi.fn();
const mockCountQuery = vi.fn();
const mockAcknowledgeMutate = vi.fn();
const mockDismissMutate = vi.fn();

vi.mock('@nous/transport', () => ({
  trpc: {
    notifications: {
      list: { useQuery: (...args: unknown[]) => mockListQuery(...args) },
      countActive: { useQuery: (...args: unknown[]) => mockCountQuery(...args) },
      acknowledge: {
        useMutation: () => ({ mutateAsync: mockAcknowledgeMutate }),
      },
      dismiss: {
        useMutation: () => ({ mutateAsync: mockDismissMutate }),
      },
    },
    useUtils: () => ({
      notifications: {
        list: { invalidate: vi.fn(), cancel: vi.fn() },
        countActive: { invalidate: vi.fn(), cancel: vi.fn() },
      },
    }),
  },
  useEventSubscription: vi.fn(),
}));

vi.mock('../../../shell/ShellContext', () => ({
  useShellContext: () => ({
    activeProjectId: 'project-1',
    activeRoute: 'inbox',
    navigate: vi.fn(),
    goBack: vi.fn(),
    mode: 'simple' as const,
    breakpoint: 'full' as const,
    navigation: { activeRoute: 'inbox', history: ['inbox'], canGoBack: false },
    conversation: { threadId: null, messages: [], isStreaming: false },
  }),
}));

function makeNotifications(count: number, overrides: Partial<NotificationRecord> = {}): NotificationRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `notif-${i}`,
    kind: 'escalation' as const,
    projectId: 'project-1',
    level: 'info' as const,
    title: `Notification ${i}`,
    message: `Message for notification ${i}`,
    status: 'active' as const,
    transient: false,
    source: 'test',
    createdAt: new Date(Date.now() - i * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    escalation: {
      escalationId: `esc-${i}`,
      severity: 'medium',
      source: { surface: 'workflow', nodeDefinitionId: 'node-1' },
      status: 'pending',
      routeTargets: ['dashboard'],
      evidenceRefs: [],
      acknowledgements: [],
    },
    ...overrides,
  })) as NotificationRecord[];
}

// Must import after mocks
const { InboxView } = await import('../InboxView');

beforeEach(() => {
  vi.clearAllMocks();
  mockListQuery.mockReturnValue({ data: [], isLoading: false, isFetching: false });
  mockCountQuery.mockReturnValue({ data: 0 });
});

describe('InboxView', () => {
  it('renders notification list when data is available', () => {
    const notifications = makeNotifications(3);
    mockListQuery.mockReturnValue({ data: notifications, isLoading: false, isFetching: false });

    render(<InboxView />);

    expect(screen.getAllByTestId('inbox-item-row')).toHaveLength(3);
  });

  it('renders InboxEmptyState when no notifications', () => {
    mockListQuery.mockReturnValue({ data: [], isLoading: false, isFetching: false });

    render(<InboxView />);

    expect(screen.getByTestId('inbox-empty-state')).toBeTruthy();
    expect(screen.getByText('No notifications')).toBeTruthy();
  });

  it('shows loading state', () => {
    mockListQuery.mockReturnValue({ data: undefined, isLoading: true, isFetching: true });

    render(<InboxView />);

    expect(screen.getByTestId('inbox-loading')).toBeTruthy();
  });

  it('filters out dismissed items client-side', () => {
    const notifications = [
      ...makeNotifications(2),
      ...makeNotifications(1, { status: 'dismissed' as const }),
    ];
    // Override IDs for dismissed
    notifications[2].id = 'dismissed-1';
    mockListQuery.mockReturnValue({ data: notifications, isLoading: false, isFetching: false });

    render(<InboxView />);

    expect(screen.getAllByTestId('inbox-item-row')).toHaveLength(2);
  });

  it('renders kind filter tabs', () => {
    render(<InboxView />);

    expect(screen.getByTestId('inbox-filter-all')).toBeTruthy();
    expect(screen.getByTestId('inbox-filter-escalations')).toBeTruthy();
    expect(screen.getByTestId('inbox-filter-alerts')).toBeTruthy();
    expect(screen.getByTestId('inbox-filter-system')).toBeTruthy();
  });

  it('kind filter tab click changes active filter', () => {
    mockListQuery.mockReturnValue({ data: [], isLoading: false, isFetching: false });

    render(<InboxView />);

    fireEvent.click(screen.getByTestId('inbox-filter-escalations'));
    // After click, the list query should be called with kind filter
    // The last call should have kind: 'escalation'
    const lastCall = mockListQuery.mock.calls[mockListQuery.mock.calls.length - 1];
    expect(lastCall[0]).toMatchObject({ kind: 'escalation' });
  });

  it('renders load-more button when hasMore is true (50+ items)', () => {
    const notifications = makeNotifications(50);
    mockListQuery.mockReturnValue({ data: notifications, isLoading: false, isFetching: false });

    render(<InboxView />);

    expect(screen.getByTestId('inbox-load-more')).toBeTruthy();
  });

  it('does not render load-more button when fewer than limit items', () => {
    const notifications = makeNotifications(10);
    mockListQuery.mockReturnValue({ data: notifications, isLoading: false, isFetching: false });

    render(<InboxView />);

    expect(screen.queryByTestId('inbox-load-more')).toBeNull();
  });

  it('calls notifications.list with projectId from ShellContext when no prop provided', () => {
    render(<InboxView />);

    expect(mockListQuery).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1' }),
    );
  });

  it('calls notifications.list with explicit projectId prop when provided', () => {
    render(<InboxView projectId="explicit-project" />);

    expect(mockListQuery).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'explicit-project' }),
    );
  });
});
