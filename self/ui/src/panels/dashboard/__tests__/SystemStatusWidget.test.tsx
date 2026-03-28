// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SystemStatusWidget } from '../widgets/SystemStatusWidget'
import type { SystemStatusSnapshot } from '@nous/shared'
import type { IDockviewPanelProps } from 'dockview-react'

vi.mock('@nous/transport', () => ({
  trpc: {
    useUtils: vi.fn().mockReturnValue({
      health: { systemStatus: { invalidate: vi.fn() } },
    }),
    health: {
      systemStatus: {
        useQuery: vi.fn().mockReturnValue({ data: undefined, isLoading: true, error: null }),
      },
    },
  },
  useEventSubscription: vi.fn(),
}))

import { trpc } from '@nous/transport'

const mockSnapshot: SystemStatusSnapshot = {
  bootStatus: 'ready',
  completedBootSteps: ['config-loaded', 'providers-registered'],
  issueCodes: [],
  inboxReady: true,
  pendingSystemRuns: 0,
  backlogAnalytics: {
    queuedCount: 2,
    activeCount: 1,
    suspendedCount: 0,
    completedInWindow: 5,
    failedInWindow: 0,
    pressureTrend: 'stable',
  },
  collectedAt: '2026-03-25T10:00:00.000Z',
}

const dockviewProps = {} as IDockviewPanelProps

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SystemStatusWidget', () => {
  it('renders loading indicator during initial fetch', () => {
    vi.mocked(trpc.health.systemStatus.useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any)

    render(<SystemStatusWidget {...dockviewProps} />)
    expect(screen.getByText('Loading system status...')).toBeTruthy()
  })

  it('renders boot status, boot steps, and collectedAt when data is available', () => {
    vi.mocked(trpc.health.systemStatus.useQuery).mockReturnValue({
      data: mockSnapshot,
      isLoading: false,
      error: null,
    } as any)

    render(<SystemStatusWidget {...dockviewProps} />)

    expect(screen.getByText('Ready')).toBeTruthy()
    expect(screen.getByText('config-loaded')).toBeTruthy()
    expect(screen.getByText('providers-registered')).toBeTruthy()
    expect(screen.getByText('stable')).toBeTruthy()
    expect(screen.getByText(/Updated:/)).toBeTruthy()
  })

  it('renders error fallback when query has error', () => {
    vi.mocked(trpc.health.systemStatus.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Server down'),
    } as any)

    render(<SystemStatusWidget {...dockviewProps} />)
    expect(screen.getByText(/Failed to load system status: Server down/)).toBeTruthy()
  })
})
