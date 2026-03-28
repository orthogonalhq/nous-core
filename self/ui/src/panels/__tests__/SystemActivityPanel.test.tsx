// @vitest-environment jsdom

import React from 'react'
import { render, screen, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  SystemActivityPanel,
  TURN_STREAM_MAX_SIZE,
} from '../SystemActivityPanel'
import type {
  SystemActivityPanelCoreProps,
  BacklogEntryProjection,
} from '../SystemActivityPanel'
import type { AgentStatusSnapshot, SystemTurnAckPayload } from '@nous/shared'
import type { IDockviewPanelProps } from 'dockview-react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBacklogUseQuery = vi.fn()
const mockGatewayUseQuery = vi.fn()
const mockBacklogInvalidate = vi.fn().mockResolvedValue(undefined)
const mockGatewayInvalidate = vi.fn().mockResolvedValue(undefined)
const mockUseEventSubscription = vi.fn()

vi.mock('@nous/transport', () => ({
  trpc: {
    useUtils: () => ({
      systemActivity: {
        backlogEntries: { invalidate: mockBacklogInvalidate },
        gatewayHealth: { invalidate: mockGatewayInvalidate },
      },
    }),
    systemActivity: {
      backlogEntries: { useQuery: (...args: any[]) => mockBacklogUseQuery(...args) },
      gatewayHealth: { useQuery: (...args: any[]) => mockGatewayUseQuery(...args) },
    },
  },
  useEventSubscription: (...args: any[]) => mockUseEventSubscription(...args),
}))

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

function setupDefaultMocks() {
  mockBacklogUseQuery.mockReturnValue({
    data: mockBacklogEntries,
    isLoading: false,
    error: null,
  })
  mockGatewayUseQuery.mockReturnValue({
    data: mockHealthSnapshot,
    isLoading: false,
    error: null,
  })
}

function renderPanel(panelProps?: Partial<SystemActivityPanelCoreProps>) {
  return render(
    <SystemActivityPanel hostingContext="observe-child" {...panelProps} />,
  )
}

function getOnEventForChannel(channel: string) {
  const call = mockUseEventSubscription.mock.calls.find(
    (c: any[]) => Array.isArray(c[0]?.channels) && (c[0].channels as string[]).includes(channel),
  )
  return call?.[0]?.onEvent
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  setupDefaultMocks()
})

describe('SystemActivityPanel', () => {
  it('renders all three sub-views', () => {
    renderPanel()

    expect(screen.getByTestId('backlog-queue-view')).toBeTruthy()
    expect(screen.getByTestId('turn-activity-view')).toBeTruthy()
    expect(screen.getByTestId('health-projection-view')).toBeTruthy()
    expect(screen.getByText('System Activity')).toBeTruthy()
  })

  it('displays backlog entries from trpc query', () => {
    renderPanel()

    expect(screen.getByText('scheduler')).toBeTruthy()
    expect(screen.getByText('principal_tool')).toBeTruthy()
    expect(screen.getByText('high')).toBeTruthy()
    expect(screen.getByText('queued')).toBeTruthy()
    expect(screen.getByText('active')).toBeTruthy()
  })

  it('displays gateway health data from trpc query', () => {
    renderPanel()

    expect(screen.getByText('Gateways')).toBeTruthy()
    expect(screen.getByText('Active Sessions')).toBeTruthy()
    expect(screen.getByText('Escalations')).toBeTruthy()
    expect(screen.getByText('Collected At')).toBeTruthy()
    const healthView = screen.getByTestId('health-projection-view')
    expect(healthView.textContent).toContain('2')
  })

  it('subscribes to correct event channels', () => {
    renderPanel()

    const channelArgs = mockUseEventSubscription.mock.calls.map(
      (c: any[]) => c[0]?.channels,
    )
    expect(channelArgs).toContainEqual(['system:backlog-change'])
    expect(channelArgs).toContainEqual(['system:turn-ack'])
    expect(channelArgs).toContainEqual(['health:gateway-status'])
  })

  it('accepts dockview props without crashing', () => {
    const dockviewProps = { params: {} } as unknown as IDockviewPanelProps & { params: Record<string, never> }
    const { container } = render(
      <SystemActivityPanel {...dockviewProps} />,
    )
    expect(container).toBeTruthy()
  })

  it('accepts observe-child props without crashing', () => {
    const coreProps: SystemActivityPanelCoreProps = {
      hostingContext: 'observe-child',
      className: 'test-class',
    }
    const { container } = render(
      <SystemActivityPanel {...coreProps} />,
    )
    expect(container).toBeTruthy()
  })

  it('shows empty state for turn stream on initial render', () => {
    renderPanel()

    expect(screen.getByTestId('turn-stream-empty')).toBeTruthy()
    expect(screen.getByText('Awaiting turn events...')).toBeTruthy()
  })

  it('appends turn event to stream when system:turn-ack fires', () => {
    renderPanel()

    const onEvent = getOnEventForChannel('system:turn-ack')
    expect(onEvent).toBeDefined()

    const event = makeTurnEvent(1)
    act(() => {
      onEvent!('system:turn-ack', event)
    })

    expect(screen.getByText('Cortex::System')).toBeTruthy()
    expect(screen.getByText('turn 1')).toBeTruthy()
    expect(screen.getByText('run-0000')).toBeTruthy()
  })

  it('calls invalidate on system:backlog-change event', () => {
    renderPanel()

    const onEvent = getOnEventForChannel('system:backlog-change')
    expect(onEvent).toBeDefined()

    act(() => {
      onEvent!('system:backlog-change', { pending: 3 })
    })

    expect(mockBacklogInvalidate).toHaveBeenCalled()
  })

  it('calls invalidate on health:gateway-status event', () => {
    renderPanel()

    const onEvent = getOnEventForChannel('health:gateway-status')
    expect(onEvent).toBeDefined()

    act(() => {
      onEvent!('health:gateway-status', { status: 'booted' })
    })

    expect(mockGatewayInvalidate).toHaveBeenCalled()
  })

  it('renders error state when backlog query has error', () => {
    mockBacklogUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Backlog unavailable'),
    })
    renderPanel()

    expect(screen.getByText(/Failed to load backlog: Backlog unavailable/)).toBeTruthy()
  })

  it('caps turn stream at TURN_STREAM_MAX_SIZE entries', () => {
    renderPanel()

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
