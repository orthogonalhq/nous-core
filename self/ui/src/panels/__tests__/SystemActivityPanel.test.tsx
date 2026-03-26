// @vitest-environment jsdom

import React from 'react'
import { render, screen, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  SystemActivityPanel,
  SystemActivityQueryProvider,
  TURN_STREAM_MAX_SIZE,
} from '../SystemActivityPanel'
import type {
  SystemActivityFetchers,
  SystemActivityPanelCoreProps,
  BacklogEntryProjection,
} from '../SystemActivityPanel'
import type { AgentStatusSnapshot, SystemTurnAckPayload } from '@nous/shared'
import type { IDockviewPanelProps } from 'dockview-react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../hooks/useEventSubscription', () => ({
  useEventSubscription: vi.fn(),
}))

import { useEventSubscription } from '../../hooks/useEventSubscription'

const mockUseEventSubscription = vi.mocked(useEventSubscription)

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockBacklogEntries: BacklogEntryProjection[] = [
  {
    id: 'entry-1',
    status: 'queued',
    source: 'scheduler',
    priority: 'high',
    acceptedAt: '2026-03-26T10:00:00.000Z',
    instructions: 'Run system check',
    runId: 'run-abc-123',
  },
  {
    id: 'entry-2',
    status: 'active',
    source: 'principal_tool',
    priority: 'normal',
    acceptedAt: '2026-03-26T10:05:00.000Z',
    instructions: 'Process dispatch',
    runId: 'run-def-456',
  },
]

const mockHealthSnapshot: AgentStatusSnapshot = {
  gateways: [
    {
      agentClass: 'Cortex::System',
      agentId: '00000000-0000-0000-0000-000000000001',
      inboxReady: true,
      visibleToolCount: 3,
      lastObservationAt: '2026-03-26T10:00:00.000Z',
      issueCount: 0,
      issueCodes: [],
    },
  ],
  appSessions: [
    {
      sessionId: 'sess-1',
      appId: 'app-1',
      packageId: 'pkg-1',
      status: 'active',
      healthStatus: 'healthy',
      startedAt: '2026-03-26T09:00:00.000Z',
      stale: false,
    },
  ],
  collectedAt: '2026-03-26T10:00:00.000Z',
  escalationCount: 2,
}

function makeTurnEvent(turn: number): SystemTurnAckPayload {
  return {
    agentClass: 'Cortex::System',
    turn,
    runId: `run-${String(turn).padStart(8, '0')}`,
    turnsUsed: turn,
    tokensUsed: turn * 100,
    emittedAt: '2026-03-26T10:00:00.000Z',
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStubFetchers(overrides?: Partial<SystemActivityFetchers>): SystemActivityFetchers {
  return {
    fetchBacklogEntries: vi.fn().mockResolvedValue(mockBacklogEntries),
    fetchGatewayHealth: vi.fn().mockResolvedValue(mockHealthSnapshot),
    ...overrides,
  }
}

function renderWithProvider(
  fetchers?: SystemActivityFetchers,
  panelProps?: Partial<SystemActivityPanelCoreProps>,
) {
  const f = fetchers ?? createStubFetchers()
  return render(
    <SystemActivityQueryProvider fetchers={f}>
      <SystemActivityPanel hostingContext="observe-child" {...panelProps} />
    </SystemActivityQueryProvider>,
  )
}

// ---------------------------------------------------------------------------
// Helpers to extract onEvent callbacks from mock calls
// ---------------------------------------------------------------------------

function getOnEventForChannel(channel: string) {
  const call = mockUseEventSubscription.mock.calls.find(
    (c) => Array.isArray(c[0]?.channels) && (c[0].channels as string[]).includes(channel),
  )
  return call?.[0]?.onEvent
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SystemActivityPanel', () => {
  // Tier 1 — Contract

  it('renders all three sub-views', async () => {
    renderWithProvider()

    expect(screen.getByTestId('backlog-queue-view')).toBeTruthy()
    expect(screen.getByTestId('turn-activity-view')).toBeTruthy()
    expect(screen.getByTestId('health-projection-view')).toBeTruthy()
    expect(screen.getByText('System Activity')).toBeTruthy()
  })

  it('displays backlog entries from fetcher', async () => {
    renderWithProvider()

    expect(await screen.findByText('scheduler')).toBeTruthy()
    expect(screen.getByText('principal_tool')).toBeTruthy()
    expect(screen.getByText('high')).toBeTruthy()
    expect(screen.getByText('queued')).toBeTruthy()
    expect(screen.getByText('active')).toBeTruthy()
  })

  it('displays gateway health data from fetcher', async () => {
    renderWithProvider()

    // Wait for data to load
    expect(await screen.findByText('Gateways')).toBeTruthy()
    expect(screen.getByText('Active Sessions')).toBeTruthy()
    expect(screen.getByText('Escalations')).toBeTruthy()
    expect(screen.getByText('Collected At')).toBeTruthy()
    // escalationCount renders within the health view
    const healthView = screen.getByTestId('health-projection-view')
    expect(healthView.textContent).toContain('2')
  })

  it('subscribes to correct event channels', () => {
    renderWithProvider()

    const channelArgs = mockUseEventSubscription.mock.calls.map(
      (c) => c[0]?.channels,
    )
    expect(channelArgs).toContainEqual(['system:backlog-change'])
    expect(channelArgs).toContainEqual(['system:turn-ack'])
    expect(channelArgs).toContainEqual(['health:gateway-status'])
  })

  it('accepts dockview props without crashing', () => {
    const fetchers = createStubFetchers()
    const dockviewProps = { params: {} } as unknown as IDockviewPanelProps & { params: Record<string, never> }
    const { container } = render(
      <SystemActivityQueryProvider fetchers={fetchers}>
        <SystemActivityPanel {...dockviewProps} />
      </SystemActivityQueryProvider>,
    )
    expect(container).toBeTruthy()
  })

  it('accepts observe-child props without crashing', () => {
    const fetchers = createStubFetchers()
    const coreProps: SystemActivityPanelCoreProps = {
      hostingContext: 'observe-child',
      className: 'test-class',
    }
    const { container } = render(
      <SystemActivityQueryProvider fetchers={fetchers}>
        <SystemActivityPanel {...coreProps} />
      </SystemActivityQueryProvider>,
    )
    expect(container).toBeTruthy()
  })

  // Tier 2 — Behavior

  it('shows empty state for turn stream on initial render', () => {
    renderWithProvider()

    expect(screen.getByTestId('turn-stream-empty')).toBeTruthy()
    expect(screen.getByText('Awaiting turn events...')).toBeTruthy()
  })

  it('appends turn event to stream when system:turn-ack fires', () => {
    renderWithProvider()

    const onEvent = getOnEventForChannel('system:turn-ack')
    expect(onEvent).toBeDefined()

    const event = makeTurnEvent(1)
    act(() => {
      onEvent!('system:turn-ack', event)
    })

    expect(screen.getByText('Cortex::System')).toBeTruthy()
    expect(screen.getByText('turn 1')).toBeTruthy()
    expect(screen.getByText('run-0000')).toBeTruthy() // truncated to 8 chars
  })

  it('triggers refetch on system:backlog-change event', async () => {
    const fetchers = createStubFetchers()
    renderWithProvider(fetchers)

    // Wait for initial fetch
    await screen.findByText('scheduler')

    const onEvent = getOnEventForChannel('system:backlog-change')
    expect(onEvent).toBeDefined()

    act(() => {
      onEvent!('system:backlog-change', { pending: 3, active: 1, suspended: 0, pressureTrend: 'stable' })
    })

    // fetchBacklogEntries should have been called more than once (initial + refetch)
    expect((fetchers.fetchBacklogEntries as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('triggers refetch on health:gateway-status event', async () => {
    const fetchers = createStubFetchers()
    renderWithProvider(fetchers)

    // Wait for initial fetch
    await screen.findByText('Gateways')

    const onEvent = getOnEventForChannel('health:gateway-status')
    expect(onEvent).toBeDefined()

    act(() => {
      onEvent!('health:gateway-status', { status: 'booted' })
    })

    expect((fetchers.fetchGatewayHealth as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('renders error state when backlog fetch fails', async () => {
    const fetchers = createStubFetchers({
      fetchBacklogEntries: vi.fn().mockRejectedValue(new Error('Backlog unavailable')),
    })
    renderWithProvider(fetchers)

    expect(await screen.findByText(/Failed to load backlog: Backlog unavailable/)).toBeTruthy()
  })

  // Tier 3 — Edge cases

  it('caps turn stream at TURN_STREAM_MAX_SIZE entries', () => {
    renderWithProvider()

    const onEvent = getOnEventForChannel('system:turn-ack')
    expect(onEvent).toBeDefined()

    const totalEvents = TURN_STREAM_MAX_SIZE + 5
    act(() => {
      for (let i = 1; i <= totalEvents; i++) {
        onEvent!('system:turn-ack', makeTurnEvent(i))
      }
    })

    const entries = screen.getAllByTestId('turn-event-entry')
    expect(entries.length).toBe(TURN_STREAM_MAX_SIZE)
  })
})
