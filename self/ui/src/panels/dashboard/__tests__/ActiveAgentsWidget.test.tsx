// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActiveAgentsWidget } from '../widgets/ActiveAgentsWidget'
import { HealthQueryProvider } from '../hooks/HealthQueryProvider'
import type { HealthFetchers } from '../hooks/HealthQueryProvider'
import type { AgentStatusSnapshot } from '@nous/shared'
import type { IDockviewPanelProps } from 'dockview-react'

vi.mock('../../../../hooks/useEventSubscription', () => ({
  useEventSubscription: vi.fn(),
}))

const mockSnapshot: AgentStatusSnapshot = {
  gateways: [
    {
      agentClass: 'nous-orchestrator',
      agentId: '00000000-0000-0000-0000-000000000001',
      inboxReady: true,
      visibleToolCount: 5,
      issueCount: 0,
      issueCodes: [],
    },
    {
      agentClass: 'nous-worker',
      agentId: '00000000-0000-0000-0000-000000000002',
      inboxReady: false,
      visibleToolCount: 3,
      issueCount: 1,
      issueCodes: ['DISPATCH_TIMEOUT'],
    },
  ],
  appSessions: [
    {
      sessionId: 'sess-001',
      appId: 'desktop',
      packageId: '@nous/desktop',
      status: 'active',
      healthStatus: 'healthy',
      startedAt: '2026-03-25T09:00:00.000Z',
      stale: false,
    },
    {
      sessionId: 'sess-002',
      appId: 'web',
      packageId: '@nous/web',
      status: 'draining',
      healthStatus: 'stale',
      startedAt: '2026-03-25T08:00:00.000Z',
      stale: true,
    },
  ],
  collectedAt: '2026-03-25T10:00:00.000Z',
}

const dockviewProps = {} as IDockviewPanelProps

function renderWithProvider(fetchers: Partial<HealthFetchers>) {
  const defaultFetchers: HealthFetchers = {
    fetchSystemStatus: vi.fn(),
    fetchProviderHealth: vi.fn(),
    fetchAgentStatus: vi.fn().mockResolvedValue(mockSnapshot),
    ...fetchers,
  }

  return render(
    <HealthQueryProvider fetchers={defaultFetchers}>
      <ActiveAgentsWidget {...dockviewProps} />
    </HealthQueryProvider>,
  )
}

describe('ActiveAgentsWidget', () => {
  it('renders loading indicator during initial fetch', () => {
    const fetcher = vi.fn().mockReturnValue(new Promise(() => {}))
    renderWithProvider({ fetchAgentStatus: fetcher })

    expect(screen.getByText('Loading agent status...')).toBeTruthy()
  })

  it('renders live gateway and session entries when data is available', async () => {
    renderWithProvider({})

    // Header with counts
    expect(await screen.findByText(/2 Gateways/)).toBeTruthy()
    expect(screen.getByText(/2 Sessions/)).toBeTruthy()

    // Gateway entries
    expect(screen.getByText('nous-orchestrator')).toBeTruthy()
    expect(screen.getByText('nous-worker')).toBeTruthy()
    expect(screen.getByText('READY')).toBeTruthy()
    expect(screen.getByText('NOT READY')).toBeTruthy()
    expect(screen.getByText('5 tools')).toBeTruthy()
    expect(screen.getByText('3 tools')).toBeTruthy()
    expect(screen.getByText('1 issue')).toBeTruthy()

    // Session entries
    expect(screen.getByText('desktop')).toBeTruthy()
    expect(screen.getByText('web')).toBeTruthy()
    expect(screen.getByText('ACTIVE')).toBeTruthy()
    expect(screen.getByText('DRAINING')).toBeTruthy()
    expect(screen.getByText('STALE')).toBeTruthy()

    // Collected at
    expect(screen.getByText(/Updated:/)).toBeTruthy()
  })

  it('renders error fallback when fetch fails', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Timeout'))
    renderWithProvider({ fetchAgentStatus: fetcher })

    expect(
      await screen.findByText(/Failed to load agent status: Timeout/),
    ).toBeTruthy()
  })
})
