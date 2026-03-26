// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../hooks/useEventSubscription', () => ({
  useEventSubscription: vi.fn(),
}));

import { MaoBacklogPressureCard } from '../mao-backlog-pressure-card';
import { MaoServicesProvider } from '../mao-services-context';
import type { MaoServicesContextValue } from '../mao-services-context';

function createSystemStatus(overrides?: {
  pressureTrend?: 'increasing' | 'stable' | 'decreasing';
  queuedCount?: number;
  activeCount?: number;
  suspendedCount?: number;
}) {
  return {
    bootStatus: 'ready',
    completedBootSteps: [],
    issueCodes: [],
    inboxReady: true,
    pendingSystemRuns: 0,
    backlogAnalytics: {
      queuedCount: overrides?.queuedCount ?? 5,
      activeCount: overrides?.activeCount ?? 3,
      suspendedCount: overrides?.suspendedCount ?? 1,
      completedInWindow: 10,
      failedInWindow: 0,
      pressureTrend: overrides?.pressureTrend ?? 'stable',
    },
    collectedAt: '2026-03-10T01:00:00.000Z',
  };
}

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

describe('MaoBacklogPressureCard', () => {
  let mockServices: MaoServicesContextValue;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServices = createMockServices();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders queuedCount, activeCount, and suspendedCount from backlogAnalytics', () => {
    mockServices = createMockServices({
      useSystemStatusQuery: vi.fn().mockReturnValue({
        data: createSystemStatus({ queuedCount: 12, activeCount: 7, suspendedCount: 4 }),
        isLoading: false,
        isError: false,
      }),
    });

    render(
      <MaoServicesProvider value={mockServices}>
        <MaoBacklogPressureCard />
      </MaoServicesProvider>,
    );

    expect(screen.getByText('Backlog pressure')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('Queued')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Suspended')).toBeTruthy();
  });

  it('displays pressureTrend badge with correct text for each trend value', () => {
    mockServices = createMockServices({
      useSystemStatusQuery: vi.fn().mockReturnValue({
        data: createSystemStatus({ pressureTrend: 'increasing' }),
        isLoading: false,
        isError: false,
      }),
    });

    const { unmount } = render(
      <MaoServicesProvider value={mockServices}>
        <MaoBacklogPressureCard />
      </MaoServicesProvider>,
    );
    expect(screen.getByText(/Increasing/)).toBeTruthy();
    unmount();

    mockServices = createMockServices({
      useSystemStatusQuery: vi.fn().mockReturnValue({
        data: createSystemStatus({ pressureTrend: 'stable' }),
        isLoading: false,
        isError: false,
      }),
    });

    const { unmount: unmount2 } = render(
      <MaoServicesProvider value={mockServices}>
        <MaoBacklogPressureCard />
      </MaoServicesProvider>,
    );
    expect(screen.getByText(/Stable/)).toBeTruthy();
    unmount2();

    mockServices = createMockServices({
      useSystemStatusQuery: vi.fn().mockReturnValue({
        data: createSystemStatus({ pressureTrend: 'decreasing' }),
        isLoading: false,
        isError: false,
      }),
    });

    render(
      <MaoServicesProvider value={mockServices}>
        <MaoBacklogPressureCard />
      </MaoServicesProvider>,
    );
    expect(screen.getByText(/Decreasing/)).toBeTruthy();
  });

  it('applies red-toned class for increasing pressure and green-toned for decreasing', () => {
    mockServices = createMockServices({
      useSystemStatusQuery: vi.fn().mockReturnValue({
        data: createSystemStatus({ pressureTrend: 'increasing' }),
        isLoading: false,
        isError: false,
      }),
    });

    const { container, unmount } = render(
      <MaoServicesProvider value={mockServices}>
        <MaoBacklogPressureCard />
      </MaoServicesProvider>,
    );
    const increasingBadge = container.querySelector('.border-red-500\\/40');
    expect(increasingBadge).toBeTruthy();
    unmount();

    mockServices = createMockServices({
      useSystemStatusQuery: vi.fn().mockReturnValue({
        data: createSystemStatus({ pressureTrend: 'decreasing' }),
        isLoading: false,
        isError: false,
      }),
    });

    const { container: container2 } = render(
      <MaoServicesProvider value={mockServices}>
        <MaoBacklogPressureCard />
      </MaoServicesProvider>,
    );
    const decreasingBadge = container2.querySelector('.border-emerald-500\\/40');
    expect(decreasingBadge).toBeTruthy();
  });

  it('renders loading state gracefully without crashing', () => {
    mockServices = createMockServices({
      useSystemStatusQuery: vi.fn().mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      }),
    });

    render(
      <MaoServicesProvider value={mockServices}>
        <MaoBacklogPressureCard />
      </MaoServicesProvider>,
    );

    expect(screen.getByText('Backlog pressure')).toBeTruthy();
    expect(screen.getByText('Loading system status...')).toBeTruthy();
  });
});
