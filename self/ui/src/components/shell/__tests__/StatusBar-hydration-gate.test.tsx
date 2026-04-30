// @vitest-environment jsdom

/**
 * WR-162 SP 1.16 — RC-1b first-data gate at StatusBar.
 *
 * Validates SUPV-SP1.16-008 (R-8 contract holds in steady state; hydration
 * window absorbs SSE events into the initial fetch instead of multiplying
 * `invalidate()` calls into the same batch tick).
 *
 * - Test 1: SSE event delivered BEFORE first query data does NOT trigger invalidate().
 * - Test 2: SSE event delivered AFTER first query data triggers exactly one
 *           invalidate() per event (R-8 steady-state preserved).
 */

import React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { StatusBar, STATUS_BAR_CHANNELS } from '../StatusBar'
import { ShellProvider } from '../ShellContext'

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

const happySnapshot = {
  backpressure: { state: 'nominal' as const, queueDepth: 1, activeAgents: 1 },
  cognitiveProfile: null,
  budget: { state: 'nominal' as const, spent: 1, ceiling: 10, period: '2026-04-01T00:00:00Z' },
  activeAgents: { count: 2, status: 'active' as const },
}

beforeEach(() => {
  mockEventSubscriptions = []
  mockInvalidate.mockClear()
  mockGetStatusBarSnapshotUseQuery.mockReset()
})

describe('StatusBar — RC-1b hydration-window first-data gate (SUPV-SP1.16-008)', () => {
  it('UT-SP1.16-SB-PRE-DATA-GATE — SSE event delivered BEFORE first query data does NOT trigger invalidate()', () => {
    // Pre-hydration state: query has no data yet.
    mockGetStatusBarSnapshotUseQuery.mockReturnValue({ data: undefined })

    render(
      <ShellProvider>
        <StatusBar />
      </ShellProvider>,
    )

    expect(mockEventSubscriptions.length).toBeGreaterThan(0)
    const sub = mockEventSubscriptions[0]!

    // Deliver an SSE event during the hydration window — the gate must
    // suppress invalidate() so the in-flight initial fetch is the canonical
    // hydration path, not invalidation-driven refetch.
    sub.onEvent('mao:projection-changed', {} as never)
    sub.onEvent('app-health:change', {} as never)
    sub.onEvent('cost:snapshot', {} as never)

    expect(mockInvalidate).not.toHaveBeenCalled()
  })

  it('UT-SP1.16-SB-POST-DATA-INVALIDATE — SSE event delivered AFTER first query data triggers invalidate() per event (R-8 preserved)', () => {
    // Steady state: query has resolved with data.
    mockGetStatusBarSnapshotUseQuery.mockReturnValue({ data: happySnapshot })

    render(
      <ShellProvider>
        <StatusBar />
      </ShellProvider>,
    )

    const sub = mockEventSubscriptions[0]!

    // Deliver three steady-state events.
    sub.onEvent(STATUS_BAR_CHANNELS[0]!, {} as never)
    sub.onEvent(STATUS_BAR_CHANNELS[1]!, {} as never)
    sub.onEvent(STATUS_BAR_CHANNELS[2]!, {} as never)

    // R-8: one invalidate per change event in steady state.
    expect(mockInvalidate).toHaveBeenCalledTimes(3)
  })

  it('Phase 1.17 SUPV-SP1.17-011: 12-channel SSE subscription invokes invalidate exactly once per change event in steady state (post-SP-1.17 fix)', () => {
    // Post-SP-1.17 invariant: even after the RC-B contract fixes land,
    // the SP 12 R-8 contract holds — exactly N invalidates per N events
    // delivered in steady state. NOT > N (regression check) and NOT < N
    // (SP 12 R-8 check). Validates that none of the RC-B memo changes
    // accidentally collapsed the event-driven invalidate path.
    mockGetStatusBarSnapshotUseQuery.mockReturnValue({ data: happySnapshot })

    render(
      <ShellProvider>
        <StatusBar />
      </ShellProvider>,
    )

    const sub = mockEventSubscriptions[0]!

    // Deliver one event on each of three distinct channels.
    sub.onEvent(STATUS_BAR_CHANNELS[0]!, {} as never)
    sub.onEvent(STATUS_BAR_CHANNELS[1]!, {} as never)
    sub.onEvent(STATUS_BAR_CHANNELS[2]!, {} as never)

    expect(mockInvalidate).toHaveBeenCalledTimes(3)
    expect(mockInvalidate).not.toHaveBeenCalledTimes(2)
    expect(mockInvalidate).not.toHaveBeenCalledTimes(4)
  })
})
