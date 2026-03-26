// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  systemStatusUseQuery: vi.fn(),
  useUtils: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    health: {
      systemStatus: {
        useQuery: mocks.systemStatusUseQuery,
      },
    },
    useUtils: mocks.useUtils,
  },
}));

vi.mock('@nous/ui', () => ({
  useEventSubscription: vi.fn(),
}));

import { MaoBacklogPressureCard } from '../mao-backlog-pressure-card';

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

describe('MaoBacklogPressureCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useUtils.mockReturnValue({
      health: {
        systemStatus: { invalidate: vi.fn() },
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders queuedCount, activeCount, and suspendedCount from backlogAnalytics', () => {
    mocks.systemStatusUseQuery.mockReturnValue({
      data: createSystemStatus({ queuedCount: 12, activeCount: 7, suspendedCount: 4 }),
      isLoading: false,
      isError: false,
    });

    render(<MaoBacklogPressureCard />);

    expect(screen.getByText('Backlog pressure')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('Queued')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Suspended')).toBeTruthy();
  });

  it('displays pressureTrend badge with correct text for each trend value', () => {
    mocks.systemStatusUseQuery.mockReturnValue({
      data: createSystemStatus({ pressureTrend: 'increasing' }),
      isLoading: false,
      isError: false,
    });

    const { unmount } = render(<MaoBacklogPressureCard />);
    expect(screen.getByText(/Increasing/)).toBeTruthy();
    unmount();

    mocks.systemStatusUseQuery.mockReturnValue({
      data: createSystemStatus({ pressureTrend: 'stable' }),
      isLoading: false,
      isError: false,
    });

    const { unmount: unmount2 } = render(<MaoBacklogPressureCard />);
    expect(screen.getByText(/Stable/)).toBeTruthy();
    unmount2();

    mocks.systemStatusUseQuery.mockReturnValue({
      data: createSystemStatus({ pressureTrend: 'decreasing' }),
      isLoading: false,
      isError: false,
    });

    render(<MaoBacklogPressureCard />);
    expect(screen.getByText(/Decreasing/)).toBeTruthy();
  });

  it('applies red-toned class for increasing pressure and green-toned for decreasing', () => {
    mocks.systemStatusUseQuery.mockReturnValue({
      data: createSystemStatus({ pressureTrend: 'increasing' }),
      isLoading: false,
      isError: false,
    });

    const { container, unmount } = render(<MaoBacklogPressureCard />);
    const increasingBadge = container.querySelector('.border-red-500\\/40');
    expect(increasingBadge).toBeTruthy();
    unmount();

    mocks.systemStatusUseQuery.mockReturnValue({
      data: createSystemStatus({ pressureTrend: 'decreasing' }),
      isLoading: false,
      isError: false,
    });

    const { container: container2 } = render(<MaoBacklogPressureCard />);
    const decreasingBadge = container2.querySelector('.border-emerald-500\\/40');
    expect(decreasingBadge).toBeTruthy();
  });

  it('renders loading state gracefully without crashing', () => {
    mocks.systemStatusUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(<MaoBacklogPressureCard />);

    expect(screen.getByText('Backlog pressure')).toBeTruthy();
    expect(screen.getByText('Loading system status...')).toBeTruthy();
  });
});
