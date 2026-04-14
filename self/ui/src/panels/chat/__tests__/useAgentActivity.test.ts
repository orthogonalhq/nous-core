import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Capture the onEvent callback from useEventSubscription
let capturedOnEvent: ((channel: string, payload: unknown) => void) | null = null
let capturedEnabled: boolean | undefined = undefined

vi.mock('@nous/transport', () => ({
  useEventSubscription: (opts: {
    channels: string[]
    onEvent: (channel: string, payload: unknown) => void
    enabled?: boolean
  }) => {
    capturedOnEvent = opts.onEvent
    capturedEnabled = opts.enabled
  },
}))

import { useAgentActivity } from '../useAgentActivity'

function fireEvent(channel: string, payload: Record<string, unknown> = {}) {
  if (!capturedOnEvent) throw new Error('onEvent not captured — hook not rendered')
  capturedOnEvent(channel, payload)
}

describe('useAgentActivity', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    capturedOnEvent = null
    capturedEnabled = undefined
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('turn-complete clears agentActive immediately', () => {
    const { result } = renderHook(() => useAgentActivity(true))

    // Activate
    act(() => fireEvent('inference:stream-start'))
    expect(result.current).toBe(true)

    // Turn complete — should clear immediately, no timer needed
    act(() => fireEvent('thought:turn-lifecycle', { phase: 'turn-complete' }))
    expect(result.current).toBe(false)
  })

  it('stream-complete uses 2s delay before clearing', () => {
    const { result } = renderHook(() => useAgentActivity(true))

    // Activate
    act(() => fireEvent('inference:stream-start'))
    expect(result.current).toBe(true)

    // Stream complete — should NOT clear immediately
    act(() => fireEvent('inference:stream-complete'))
    expect(result.current).toBe(true)

    // Advance 1.9s — still active
    act(() => vi.advanceTimersByTime(1900))
    expect(result.current).toBe(true)

    // Advance to 2s — now cleared
    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe(false)
  })

  it('turn-complete cancels pending stream-complete timer', () => {
    const { result } = renderHook(() => useAgentActivity(true))

    // Activate
    act(() => fireEvent('inference:stream-start'))
    expect(result.current).toBe(true)

    // Stream complete starts 2s timer
    act(() => fireEvent('inference:stream-complete'))
    expect(result.current).toBe(true)

    // Turn complete clears immediately and cancels the timer
    act(() => fireEvent('thought:turn-lifecycle', { phase: 'turn-complete' }))
    expect(result.current).toBe(false)

    // Advancing past 2s should not cause any issues (timer was cancelled)
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current).toBe(false)
  })

  it('stream-complete after turn-complete is harmless (idempotent)', () => {
    const { result } = renderHook(() => useAgentActivity(true))

    // Activate
    act(() => fireEvent('inference:stream-start'))
    expect(result.current).toBe(true)

    // Turn complete clears immediately
    act(() => fireEvent('thought:turn-lifecycle', { phase: 'turn-complete' }))
    expect(result.current).toBe(false)

    // Late stream-complete — starts a timer that will set false on already-false
    act(() => fireEvent('inference:stream-complete'))
    expect(result.current).toBe(false)

    // Timer fires — still false, no error
    act(() => vi.advanceTimersByTime(2000))
    expect(result.current).toBe(false)
  })

  it('passes enabled flag to useEventSubscription', () => {
    renderHook(() => useAgentActivity(false))
    expect(capturedEnabled).toBe(false)

    renderHook(() => useAgentActivity(true))
    expect(capturedEnabled).toBe(true)
  })
})
