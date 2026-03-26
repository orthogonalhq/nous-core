// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SystemStatusWidget } from '../widgets/SystemStatusWidget'
import { HealthQueryProvider } from '../hooks/HealthQueryProvider'
import type { HealthFetchers } from '../hooks/HealthQueryProvider'
import type { SystemStatusSnapshot } from '@nous/shared'
import type { IDockviewPanelProps } from 'dockview-react'

vi.mock('../../../../hooks/useEventSubscription', () => ({
  useEventSubscription: vi.fn(),
}))

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

function renderWithProvider(fetchers: Partial<HealthFetchers>) {
  const defaultFetchers: HealthFetchers = {
    fetchSystemStatus: vi.fn().mockResolvedValue(mockSnapshot),
    fetchProviderHealth: vi.fn(),
    fetchAgentStatus: vi.fn(),
    ...fetchers,
  }

  return render(
    <HealthQueryProvider fetchers={defaultFetchers}>
      <SystemStatusWidget {...dockviewProps} />
    </HealthQueryProvider>,
  )
}

describe('SystemStatusWidget', () => {
  it('renders loading indicator during initial fetch', () => {
    // Fetcher that never resolves to keep loading state
    const fetcher = vi.fn().mockReturnValue(new Promise(() => {}))
    renderWithProvider({ fetchSystemStatus: fetcher })

    expect(screen.getByText('Loading system status...')).toBeTruthy()
  })

  it('renders boot status, boot steps, and collectedAt when data is available', async () => {
    renderWithProvider({})

    // Wait for data to render
    expect(await screen.findByText('Ready')).toBeTruthy()
    expect(screen.getByText('config-loaded')).toBeTruthy()
    expect(screen.getByText('providers-registered')).toBeTruthy()
    expect(screen.getByText('stable')).toBeTruthy()
    // collectedAt rendered as localized time
    expect(screen.getByText(/Updated:/)).toBeTruthy()
  })

  it('renders error fallback when fetch fails', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Server down'))
    renderWithProvider({ fetchSystemStatus: fetcher })

    expect(await screen.findByText(/Failed to load system status: Server down/)).toBeTruthy()
  })
})
