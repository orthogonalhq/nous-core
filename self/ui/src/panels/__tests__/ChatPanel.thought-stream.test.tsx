// @vitest-environment jsdom

import React from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { ChatPanel } from '../ChatPanel'
import type { ChatAPI } from '../ChatPanel'
import type { ThoughtPfcDecisionPayload, ThoughtTurnLifecyclePayload } from '@nous/shared'

// Use refs to always hold the latest onEvent callbacks from useEventSubscription
// ChatPanel registers multiple subscriptions — we track all active ones by channel set
const latestCallbacks = new Map<string, (channel: string, payload: unknown) => void>()

vi.mock('@nous/transport', () => ({
  useEventSubscription: (options: { channels: string[]; onEvent: (channel: string, payload: unknown) => void; enabled?: boolean }) => {
    if (options.enabled !== false) {
      // Key by sorted channel list to deduplicate across re-renders
      const key = [...options.channels].sort().join(',')
      latestCallbacks.set(key, options.onEvent)
    }
  },
  trpc: {
    traces: {
      get: {
        useQuery: () => ({ data: null, isLoading: false, isError: false }),
      },
    },
  },
}))

/** Broadcast an event to all matching enabled subscriptions */
function emitEvent(channel: string, payload: unknown) {
  for (const [key, onEvent] of latestCallbacks) {
    const channels = key.split(',')
    if (channels.some(c => c === channel || (c.endsWith('*') && channel.startsWith(c.slice(0, -1))))) {
      onEvent(channel, payload)
    }
  }
}

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

/**
 * Creates a ChatPanel in idle state (not sending).
 */
function renderIdlePanel() {
  const mockApi: ChatAPI = {
    send: vi.fn().mockResolvedValue({ response: 'ok', traceId: 'trace-1' }),
    getHistory: async () => [],
  }
  return render(<ChatPanel chatApi={mockApi} />)
}

describe('ChatPanel — Thought Stream', () => {
  beforeEach(() => {
    latestCallbacks.clear()
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

  it('accumulates thoughts regardless of sending state', async () => {
    renderIdlePanel()

    // Emit a thought event while NOT sending
    act(() => {
      emitEvent('thought:pfc-decision', makePfcPayload())
    })

    // Thought should accumulate even when not sending (sendingRef gate removed)
    expect(screen.getByTestId('thought-toggle')).toBeTruthy()
    expect(screen.getByText('1 thought')).toBeTruthy()
  })

  it('shows correct pluralization for multiple thoughts', async () => {
    renderSendingPanel()

    act(() => {
      emitEvent('thought:pfc-decision', makePfcPayload({ sequence: 1 }))
      emitEvent('thought:turn-lifecycle', makeLifecyclePayload({ sequence: 2 }))
    })

    expect(screen.getByText('2 thoughts')).toBeTruthy()
  })

  it('thoughts persist after send completes (SSE idle timer handles cleanup)', async () => {
    const { resolveSend } = renderSendingPanel()

    act(() => {
      emitEvent('thought:pfc-decision', makePfcPayload())
    })

    expect(screen.getByTestId('thought-toggle')).toBeTruthy()

    // Resolve the send promise to transition sending to false
    await act(async () => {
      resolveSend({ response: 'done', traceId: 'trace-1' })
    })

    // Thoughts persist — they are no longer cleared on send completion.
    // In production, the SSE turn-complete event + idle timer handles cleanup.
    expect(screen.getByTestId('thought-toggle')).toBeTruthy()
  })

  it('collapsed state shows thought count chip and stream is in DOM but hidden', async () => {
    renderSendingPanel()

    act(() => {
      emitEvent('thought:pfc-decision', makePfcPayload())
    })

    // Collapsed by default — toggle visible, stream in DOM but hidden via CSS
    expect(screen.getByTestId('thought-toggle')).toBeTruthy()
    const stream = screen.getByTestId('thought-stream')
    expect(stream.style.opacity).toBe('0')
    expect(stream.style.maxHeight).toBe('0px')
    expect(stream.style.overflow).toBe('hidden')
  })

  it('expanded state shows thought events with ThoughtCard components', async () => {
    renderSendingPanel()

    act(() => {
      emitEvent('thought:pfc-decision', makePfcPayload({
        thoughtType: 'memory-write',
        content: 'MEM-WRITE-APPROVED confidence=0.85',
      }))
    })

    // Click toggle to expand
    fireEvent.click(screen.getByTestId('thought-toggle'))

    expect(screen.getByTestId('thought-stream')).toBeTruthy()
    expect(screen.getByText('[Memory Write]')).toBeTruthy()
    expect(screen.getByText('MEM-WRITE-APPROVED confidence=0.85')).toBeTruthy()
  })

  it('renders lifecycle events with phase label and content/status', async () => {
    renderSendingPanel()

    act(() => {
      emitEvent('thought:turn-lifecycle', makeLifecyclePayload({
        phase: 'gateway-run',
        status: 'completed',
        content: 'gateway execution finished',
      }))
    })

    fireEvent.click(screen.getByTestId('thought-toggle'))

    expect(screen.getByText('[Gateway Execution]')).toBeTruthy()
    expect(screen.getByText('gateway execution finished')).toBeTruthy()
  })

  it('renders lifecycle events with status fallback when content is absent', async () => {
    renderSendingPanel()

    act(() => {
      emitEvent('thought:turn-lifecycle', makeLifecyclePayload({
        phase: 'turn-start',
        status: 'started',
        content: undefined,
      }))
    })

    fireEvent.click(screen.getByTestId('thought-toggle'))

    expect(screen.getByText('[Turn Started]')).toBeTruthy()
    expect(screen.getByText('started')).toBeTruthy()
  })

  it('toggle preference persists to localStorage', async () => {
    renderSendingPanel()

    act(() => {
      emitEvent('thought:pfc-decision', makePfcPayload())
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
      emitEvent('thought:pfc-decision', makePfcPayload())
    })

    // Should be expanded on mount because localStorage says so (detailsAlwaysOn)
    const stream = screen.getByTestId('thought-stream')
    expect(stream.style.opacity).toBe('1')
  })

  it('caps at 50 events, truncating older ones', async () => {
    localStorage.setItem('nous:thoughts-expanded', 'true')

    renderSendingPanel()

    // Emit 55 events
    act(() => {
      for (let i = 0; i < 55; i++) {
        emitEvent('thought:pfc-decision', makePfcPayload({
          sequence: i,
          content: `event-${i}`,
        }))
      }
    })

    const events = screen.getAllByTestId('thought-event')
    expect(events.length).toBe(50)

    // The last event should be event-54 (most recent)
    expect(screen.getByText('event-54')).toBeTruthy()
    // The first retained event should be event-5 (55 - 50 = 5)
    expect(screen.getByText('event-5')).toBeTruthy()
    // event-4 should be truncated
    expect(screen.queryByText('event-4')).toBeNull()
  })

  it('ThoughtToggle shows "Thinking..." when sending and collapsed', async () => {
    renderSendingPanel()

    act(() => {
      emitEvent('thought:pfc-decision', makePfcPayload())
    })

    // Collapsed by default + sending=true: should show "Thinking..."
    expect(screen.getByText('Thinking...')).toBeTruthy()
  })

  it('ThoughtStream container has correct ARIA attributes', async () => {
    localStorage.setItem('nous:thoughts-expanded', 'true')

    renderSendingPanel()

    act(() => {
      emitEvent('thought:pfc-decision', makePfcPayload())
    })

    const stream = screen.getByTestId('thought-stream')
    expect(stream.getAttribute('role')).toBe('log')
    expect(stream.getAttribute('aria-live')).toBe('polite')
    expect(stream.getAttribute('aria-label')).toBe('AI thought stream')
    expect(stream.getAttribute('id')).toBe('thought-stream')
  })

  it('ThoughtToggle has correct ARIA attributes', async () => {
    renderSendingPanel()

    act(() => {
      emitEvent('thought:pfc-decision', makePfcPayload())
    })

    const toggle = screen.getByTestId('thought-toggle')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-controls')).toBe('thought-stream')
    expect(toggle.getAttribute('aria-label')).toContain('1 event')

    // Expand and verify aria-expanded changes
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })

  it('ThoughtStream is always in DOM when thoughts exist (always-render pattern)', async () => {
    renderSendingPanel()

    act(() => {
      emitEvent('thought:pfc-decision', makePfcPayload())
    })

    // Even when collapsed, ThoughtStream is in the DOM
    expect(screen.getByTestId('thought-stream')).toBeTruthy()
  })

  it('expanded ThoughtStream has opacity 1 and non-zero maxHeight', async () => {
    renderSendingPanel()

    act(() => {
      emitEvent('thought:pfc-decision', makePfcPayload())
    })

    // Expand
    fireEvent.click(screen.getByTestId('thought-toggle'))

    const stream = screen.getByTestId('thought-stream')
    expect(stream.style.opacity).toBe('1')
    expect(stream.style.maxHeight).not.toBe('0px')
  })
})

describe('ChatPanel — Stage-aware rendering', () => {
  beforeEach(() => {
    latestCallbacks.clear()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders full mode by default when stage is undefined', () => {
    const mockApi: ChatAPI = {
      send: vi.fn().mockResolvedValue({ response: 'ok', traceId: 'trace-1' }),
      getHistory: async () => [],
    }
    const { container } = render(<ChatPanel chatApi={mockApi} />)

    // Full mode: header and messages area should be present
    expect(container.querySelector('[data-chat-stage="full"]')).toBeTruthy()
    expect(screen.getByText('Principal \u2194 Cortex')).toBeTruthy()
  })

  it('renders full mode explicitly when stage="full"', () => {
    const mockApi: ChatAPI = {
      send: vi.fn().mockResolvedValue({ response: 'ok', traceId: 'trace-1' }),
      getHistory: async () => [],
    }
    const { container } = render(<ChatPanel chatApi={mockApi} stage="full" />)

    expect(container.querySelector('[data-chat-stage="full"]')).toBeTruthy()
    expect(screen.getByText('Principal \u2194 Cortex')).toBeTruthy()
  })

  it('ambient stage hides header and messages, shows only input', () => {
    const mockApi: ChatAPI = {
      send: vi.fn().mockResolvedValue({ response: 'ok', traceId: 'trace-1' }),
      getHistory: async () => [],
    }
    const { container } = render(<ChatPanel chatApi={mockApi} stage="ambient" />)

    expect(container.querySelector('[data-chat-stage="ambient"]')).toBeTruthy()
    // Header text should NOT be present
    expect(screen.queryByText('Principal \u2194 Cortex')).toBeNull()
    // Input should still be present
    expect(screen.getByPlaceholderText(/Message Nous/i)).toBeTruthy()
    // Send button should still be present
    expect(screen.getByText('Send')).toBeTruthy()
  })

  it('ambient stage shows thinking indicator when sending', () => {
    let resolveSend: ((value: { response: string; traceId: string }) => void) | undefined
    const sendPromise = new Promise<{ response: string; traceId: string }>((resolve) => {
      resolveSend = resolve
    })
    const mockApi: ChatAPI = {
      send: () => sendPromise,
      getHistory: async () => [],
    }

    render(<ChatPanel chatApi={mockApi} stage="ambient" />)

    // Type and send a message
    const textarea = screen.getByPlaceholderText(/Message Nous/i)
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    fireEvent.click(screen.getByText('Send'))

    // Thinking indicator should appear
    expect(screen.getByTestId('chat-stage-toggle')).toBeTruthy()
    expect(screen.getByText('Thinking...')).toBeTruthy()
  })

  it('ambient stage expand button calls onStageChange with peek', () => {
    let resolveSend: ((value: { response: string; traceId: string }) => void) | undefined
    const sendPromise = new Promise<{ response: string; traceId: string }>((resolve) => {
      resolveSend = resolve
    })
    const mockApi: ChatAPI = {
      send: () => sendPromise,
      getHistory: async () => [],
    }
    const onStageChange = vi.fn()

    render(<ChatPanel chatApi={mockApi} stage="ambient" onStageChange={onStageChange} />)

    // Trigger sending state
    const textarea = screen.getByPlaceholderText(/Message Nous/i)
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    fireEvent.click(screen.getByText('Send'))

    // Click expand chevron
    fireEvent.click(screen.getByTestId('ambient-expand-button'))
    expect(onStageChange).toHaveBeenCalledWith('peek')
  })

  it('peek stage shows header with collapse button', () => {
    const mockApi: ChatAPI = {
      send: vi.fn().mockResolvedValue({ response: 'ok', traceId: 'trace-1' }),
      getHistory: async () => [],
    }
    const { container } = render(<ChatPanel chatApi={mockApi} stage="peek" />)

    expect(container.querySelector('[data-chat-stage="peek"]')).toBeTruthy()
    expect(screen.getByText('Principal \u2194 Cortex')).toBeTruthy()
    expect(screen.getByTestId('chat-stage-toggle')).toBeTruthy()
  })

  it('peek stage collapse button calls onStageChange with ambient', () => {
    const mockApi: ChatAPI = {
      send: vi.fn().mockResolvedValue({ response: 'ok', traceId: 'trace-1' }),
      getHistory: async () => [],
    }
    const onStageChange = vi.fn()

    render(<ChatPanel chatApi={mockApi} stage="peek" onStageChange={onStageChange} />)

    fireEvent.click(screen.getByTestId('chat-stage-toggle'))
    expect(onStageChange).toHaveBeenCalledWith('ambient')
  })

  it('peek stage shows only last 5 messages', async () => {
    const messages: { role: 'user' | 'assistant'; content: string; timestamp: string }[] = []
    for (let i = 0; i < 10; i++) {
      messages.push({ role: 'user', content: `msg-${i}`, timestamp: new Date().toISOString() })
    }
    const mockApi: ChatAPI = {
      send: vi.fn().mockResolvedValue({ response: 'ok', traceId: 'trace-1' }),
      getHistory: async () => messages,
    }

    render(<ChatPanel chatApi={mockApi} stage="peek" />)

    // Wait for history to load
    await act(async () => {})

    // Last 5 messages should be visible
    expect(screen.getByText('msg-9')).toBeTruthy()
    expect(screen.getByText('msg-5')).toBeTruthy()
    // Earlier messages should not be visible
    expect(screen.queryByText('msg-4')).toBeNull()
    expect(screen.queryByText('msg-0')).toBeNull()
  })

  it('full stage shows all messages', async () => {
    const messages: { role: 'user' | 'assistant'; content: string; timestamp: string }[] = []
    for (let i = 0; i < 10; i++) {
      messages.push({ role: 'user', content: `msg-${i}`, timestamp: new Date().toISOString() })
    }
    const mockApi: ChatAPI = {
      send: vi.fn().mockResolvedValue({ response: 'ok', traceId: 'trace-1' }),
      getHistory: async () => messages,
    }

    render(<ChatPanel chatApi={mockApi} stage="full" />)

    // Wait for history to load
    await act(async () => {})

    // All messages should be visible
    expect(screen.getByText('msg-0')).toBeTruthy()
    expect(screen.getByText('msg-9')).toBeTruthy()
  })
})
