// @vitest-environment jsdom

import React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { StatusBar, STATUS_BAR_CHANNELS } from '../StatusBar'
import { ShellProvider } from '../../shell/ShellContext'

// Capture useEventSubscription opts for assertion.
let mockEventSubscriptions: Array<{ channels: string[]; onEvent: (...args: unknown[]) => void }> = []

const mockInvalidate = vi.fn(async () => {})
const mockGetStatusBarSnapshotUseQuery = vi.fn<(input: unknown) => unknown>()

vi.mock('@nous/transport', () => ({
  trpc: {
    health: {
      getStatusBarSnapshot: {
        useQuery: (input: unknown) => mockGetStatusBarSnapshotUseQuery(input),
      },
    },
    projects: {
      get: {
        useQuery: () => ({ data: undefined }),
      },
    },
    useUtils: () => ({
      health: {
        getStatusBarSnapshot: { invalidate: mockInvalidate },
      },
    }),
  },
  useEventSubscription: (opts: { channels: string[]; onEvent: (...args: unknown[]) => void }) => {
    mockEventSubscriptions.push(opts)
  },
}))

beforeEach(() => {
  mockEventSubscriptions = []
  mockInvalidate.mockClear()
  mockGetStatusBarSnapshotUseQuery.mockReset()
  mockGetStatusBarSnapshotUseQuery.mockReturnValue({ data: undefined })
})

const happySnapshot = {
  backpressure: { state: 'nominal' as const, queueDepth: 1, activeAgents: 1 },
  cognitiveProfile: null,
  budget: { state: 'nominal' as const, spent: 1, ceiling: 10, period: '2026-04-01T00:00:00Z' },
  activeAgents: { count: 2, status: 'active' as const },
}

/**
 * WR-162 SP 12 (SUPV-SP12-005 + SUPV-SP12-006) — StatusBar tests.
 */
describe('StatusBar', () => {
  it('UT-SP12-SB-RENDER-LAYOUT — renders four indicators in named order', () => {
    mockGetStatusBarSnapshotUseQuery.mockReturnValue({ data: happySnapshot })
    const { container } = render(
      <ShellProvider activeProjectId="proj-1">
        <StatusBar />
      </ShellProvider>,
    )
    const strip = container.querySelector('[data-shell-component="observability-status-bar"]') as HTMLElement
    expect(strip).toBeTruthy()
    const indicators = Array.from(strip.querySelectorAll('[data-indicator]'))
    expect(indicators.map((el) => el.getAttribute('data-indicator'))).toEqual([
      'backpressure',
      'cognitive-profile',
      'budget',
      'active-agents',
    ])
  })

  it('UT-SP12-SB-RENDER-16PX-HEIGHT — outer container has height: 16px', () => {
    mockGetStatusBarSnapshotUseQuery.mockReturnValue({ data: happySnapshot })
    const { container } = render(
      <ShellProvider>
        <StatusBar />
      </ShellProvider>,
    )
    const strip = container.querySelector('[data-shell-component="observability-status-bar"]') as HTMLElement
    expect(strip.style.height).toBe('16px')
  })

  it('UT-SP12-SB-QUERY-KEYING — useQuery invoked with projectId from active context', () => {
    mockGetStatusBarSnapshotUseQuery.mockReturnValue({ data: happySnapshot })
    render(
      <ShellProvider activeProjectId="proj-1">
        <StatusBar />
      </ShellProvider>,
    )
    expect(mockGetStatusBarSnapshotUseQuery).toHaveBeenCalledWith({ projectId: 'proj-1' })
  })

  it('UT-SP12-SB-QUERY-NULL-PROJECT — useQuery invoked with projectId: undefined when no project', () => {
    mockGetStatusBarSnapshotUseQuery.mockReturnValue({ data: happySnapshot })
    render(
      <ShellProvider activeProjectId={null}>
        <StatusBar />
      </ShellProvider>,
    )
    expect(mockGetStatusBarSnapshotUseQuery).toHaveBeenCalledWith({ projectId: undefined })
  })

  it('UT-SP12-SB-12-CHANNEL-SUBSCRIPTION — subscribes to 12 channels', () => {
    mockGetStatusBarSnapshotUseQuery.mockReturnValue({ data: happySnapshot })
    render(
      <ShellProvider>
        <StatusBar />
      </ShellProvider>,
    )
    expect(mockEventSubscriptions.length).toBeGreaterThan(0)
    const sub = mockEventSubscriptions[0]
    expect(sub.channels.length).toBe(12)
    expect(sub.channels).toEqual([...STATUS_BAR_CHANNELS])
    expect(typeof sub.onEvent).toBe('function')
  })

  it('UT-SP12-SB-INVALIDATION-PER-EVENT — exactly one invalidation per channel event (R-8 coarse)', async () => {
    mockGetStatusBarSnapshotUseQuery.mockReturnValue({ data: happySnapshot })
    render(
      <ShellProvider>
        <StatusBar />
      </ShellProvider>,
    )
    const sub = mockEventSubscriptions[0]
    for (const channel of STATUS_BAR_CHANNELS) {
      sub.onEvent(channel, {} as never)
    }
    expect(mockInvalidate).toHaveBeenCalledTimes(STATUS_BAR_CHANNELS.length)
  })

  it('UT-SP12-SB-COGNITIVE-NOT-PASSED-TO-INDICATOR — CognitiveProfileIndicator is rendered without a slot prop', () => {
    mockGetStatusBarSnapshotUseQuery.mockReturnValue({ data: happySnapshot })
    const { container } = render(
      <ShellProvider activeProjectId="proj-1">
        <StatusBar />
      </ShellProvider>,
    )
    // The cognitive-profile indicator exists in the strip.
    const cp = container.querySelector('[data-indicator="cognitive-profile"]') as HTMLButtonElement
    expect(cp).toBeTruthy()
    // The structural guard: CognitiveProfileIndicator's React element does not
    // receive `slot` from StatusBar — verified at the type level (the element
    // signature is propless). Also enforced via the formatter file having no
    // `snapshot.cognitiveProfile` reference (Phase G grep at Task 41).
  })
})
