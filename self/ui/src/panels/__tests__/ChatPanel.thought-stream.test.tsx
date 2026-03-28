// @vitest-environment jsdom

import React from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { ChatPanel } from '../ChatPanel'
import type { ChatAPI } from '../ChatPanel'
import type { ThoughtPfcDecisionPayload, ThoughtTurnLifecyclePayload } from '@nous/shared'

// Capture the onEvent callback from useEventSubscription
let capturedOnEvent: ((channel: string, payload: unknown) => void) | null = null

vi.mock('@nous/transport', () => ({
  useEventSubscription: (options: { onEvent: (channel: string, payload: unknown) => void }) => {
    capturedOnEvent = options.onEvent
  },
}))

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})

function makePfcPayload(overrides?: Partial<ThoughtPfcDecisionPayload>): ThoughtPfcDecisionPayload {
  return {
    traceId: 'trace-1',
    thoughtType: 'confidence-governance',
    decision: 'approved',
    reason: 'high confidence',
    content: 'patternId=chat-response outcome=approved tier=3',
    sequence: 1,
    emittedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeLifecyclePayload(overrides?: Partial<ThoughtTurnLifecyclePayload>): ThoughtTurnLifecyclePayload {
  return {
    traceId: 'trace-1',
    phase: 'turn-start',
    status: 'started',
    sequence: 0,
    emittedAt: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Creates a ChatPanel that is actively in the "sending" state,
 * so thought events can accumulate and render.
 */
function renderSendingPanel() {
  // chatApi.send returns a promise that never resolves, keeping sending=true
  let resolveSend: ((value: { response: string; traceId: string }) => void) | undefined
  const sendPromise = new Promise<{ response: string; traceId: string }>((resolve) => {
    resolveSend = resolve
  })
  const mockApi: ChatAPI = {
    send: () => sendPromise,
    getHistory: async () => [],
  }

  const result = render(<ChatPanel chatApi={mockApi} />)

  // Type a message and send to trigger sending=true
  const textarea = screen.getByPlaceholderText(/Message Nous/i)
  fireEvent.change(textarea, { target: { value: 'Hello' } })
  const sendButton = screen.getByText('Send')
  fireEvent.click(sendButton)

  return { ...result, resolveSend: resolveSend! }
}

describe('ChatPanel — Thought Stream', () => {
  beforeEach(() => {
    capturedOnEvent = null
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders normally without thought events (graceful no-op)', () => {
    render(<ChatPanel />)
    expect(screen.queryByTestId('thought-toggle')).toBeNull()
    expect(screen.queryByTestId('thought-stream')).toBeNull()
  })

  it('accumulates thoughts during sending state', async () => {
    renderSendingPanel()

    // Emit a thought event
    act(() => {
      capturedOnEvent!('thought:pfc-decision', makePfcPayload())
    })

    expect(screen.getByTestId('thought-toggle')).toBeTruthy()
    expect(screen.getByText('1 thought')).toBeTruthy()
  })

  it('shows correct pluralization for multiple thoughts', async () => {
    renderSendingPanel()

    act(() => {
      capturedOnEvent!('thought:pfc-decision', makePfcPayload({ sequence: 1 }))
      capturedOnEvent!('thought:turn-lifecycle', makeLifecyclePayload({ sequence: 2 }))
    })

    expect(screen.getByText('2 thoughts')).toBeTruthy()
  })

  it('clears thoughts when sending becomes false (response arrives)', async () => {
    const { resolveSend } = renderSendingPanel()

    act(() => {
      capturedOnEvent!('thought:pfc-decision', makePfcPayload())
    })

    expect(screen.getByTestId('thought-toggle')).toBeTruthy()

    // Resolve the send promise to transition sending to false
    await act(async () => {
      resolveSend({ response: 'done', traceId: 'trace-1' })
    })

    expect(screen.queryByTestId('thought-toggle')).toBeNull()
  })

  it('collapsed state shows thought count chip but not event details', async () => {
    renderSendingPanel()

    act(() => {
      capturedOnEvent!('thought:pfc-decision', makePfcPayload())
    })

    // Collapsed by default — toggle visible, stream not
    expect(screen.getByTestId('thought-toggle')).toBeTruthy()
    expect(screen.queryByTestId('thought-stream')).toBeNull()
  })

  it('expanded state shows thought events', async () => {
    renderSendingPanel()

    act(() => {
      capturedOnEvent!('thought:pfc-decision', makePfcPayload({
        thoughtType: 'memory-write',
        content: 'MEM-WRITE-APPROVED confidence=0.85',
      }))
    })

    // Click toggle to expand
    fireEvent.click(screen.getByTestId('thought-toggle'))

    expect(screen.getByTestId('thought-stream')).toBeTruthy()
    expect(screen.getByText('[memory-write]')).toBeTruthy()
    expect(screen.getByText('MEM-WRITE-APPROVED confidence=0.85')).toBeTruthy()
  })

  it('renders lifecycle events with phase label and content/status', async () => {
    renderSendingPanel()

    act(() => {
      capturedOnEvent!('thought:turn-lifecycle', makeLifecyclePayload({
        phase: 'gateway-run',
        status: 'completed',
        content: 'gateway execution finished',
      }))
    })

    fireEvent.click(screen.getByTestId('thought-toggle'))

    expect(screen.getByText('[gateway-run]')).toBeTruthy()
    expect(screen.getByText('gateway execution finished')).toBeTruthy()
  })

  it('renders lifecycle events with status fallback when content is absent', async () => {
    renderSendingPanel()

    act(() => {
      capturedOnEvent!('thought:turn-lifecycle', makeLifecyclePayload({
        phase: 'turn-start',
        status: 'started',
        content: undefined,
      }))
    })

    fireEvent.click(screen.getByTestId('thought-toggle'))

    expect(screen.getByText('[turn-start]')).toBeTruthy()
    expect(screen.getByText('started')).toBeTruthy()
  })

  it('toggle preference persists to localStorage', async () => {
    renderSendingPanel()

    act(() => {
      capturedOnEvent!('thought:pfc-decision', makePfcPayload())
    })

    // Expand
    fireEvent.click(screen.getByTestId('thought-toggle'))
    expect(localStorage.getItem('nous:thoughts-expanded')).toBe('true')

    // Collapse
    fireEvent.click(screen.getByTestId('thought-toggle'))
    expect(localStorage.getItem('nous:thoughts-expanded')).toBe('false')
  })

  it('restores expanded state from localStorage on mount', async () => {
    localStorage.setItem('nous:thoughts-expanded', 'true')

    renderSendingPanel()

    act(() => {
      capturedOnEvent!('thought:pfc-decision', makePfcPayload())
    })

    // Should be expanded on mount because localStorage says so
    expect(screen.getByTestId('thought-stream')).toBeTruthy()
  })

  it('caps at 20 events, truncating older ones', async () => {
    localStorage.setItem('nous:thoughts-expanded', 'true')

    renderSendingPanel()

    // Emit 25 events
    act(() => {
      for (let i = 0; i < 25; i++) {
        capturedOnEvent!('thought:pfc-decision', makePfcPayload({
          sequence: i,
          content: `event-${i}`,
        }))
      }
    })

    const events = screen.getAllByTestId('thought-event')
    expect(events.length).toBe(20)

    // The last event should be event-24 (most recent)
    expect(screen.getByText('event-24')).toBeTruthy()
    // The first retained event should be event-5 (25 - 20 = 5)
    expect(screen.getByText('event-5')).toBeTruthy()
    // event-4 should be truncated
    expect(screen.queryByText('event-4')).toBeNull()
  })
})
