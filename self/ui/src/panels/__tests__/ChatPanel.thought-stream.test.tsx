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
    // SP 1.9 Plan Task #14 — `useUtils()` + `chat.getHistory.useQuery`
    // surface added so the SP 1.9 ChatPanel useQuery migration does not
    // throw "Did you forget to wrap your App inside `withTRPC` HoC?" in
    // this fixture's render. History is empty (the thought-stream tests
    // exercise event-stream rendering, not the persisted history surface).
    useUtils: () => ({
      chat: {
        getHistory: {
          invalidate: vi.fn().mockResolvedValue(undefined),
        },
      },
    }),
    chat: {
      getHistory: {
        useQuery: () => ({
          data: { entries: [] },
          isSuccess: true,
          isError: false,
          isLoading: false,
          isFetching: false,
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      sendMessage: {
        useMutation: () => ({ mutateAsync: vi.fn().mockResolvedValue({}) }),
      },
    },
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
 * so thought events can accumulate and render inline.
 */
function renderSendingPanel() {
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
  const textarea = screen.getByPlaceholderText(/What can I help you with/i)
  fireEvent.change(textarea, { target: { value: 'Hello' } })
  const sendButton = screen.getByTitle('Send message')
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

describe('ChatPanel — Inline Thought Stream', () => {
  beforeEach(() => {
    latestCallbacks.clear()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders normally without thought events (no inline groups)', () => {
    render(<ChatPanel />)
    expect(screen.queryByTestId('inline-thought-group')).toBeNull()
    expect(screen.queryByTestId('ambient-teleprompter')).toBeNull()
  })

  it('shows in-progress thought items for active turn (Q2 — inline below user message)', () => {
    renderSendingPanel()

    // gateway-run started → "Thinking…" (Q5 filter)
    act(() => {
      emitEvent('thought:turn-lifecycle', makeLifecyclePayload({
        phase: 'gateway-run',
        status: 'started',
      }))
    })

    const group = screen.getByTestId('inline-thought-group')
    expect(group).toBeTruthy()
    expect(screen.getByText('Thinking\u2026')).toBeTruthy()
  })

  it('filters suppressed events per Q5 — confidence-governance not shown', () => {
    renderSendingPanel()

    // confidence-governance is suppressed
    act(() => {
      emitEvent('thought:pfc-decision', makePfcPayload({
        thoughtType: 'confidence-governance',
      }))
    })

    expect(screen.queryByTestId('inline-thought-group')).toBeNull()
  })

  it('shows tool-execution as "Using [tool name]" (Q5)', () => {
    renderSendingPanel()

    act(() => {
      emitEvent('thought:pfc-decision', makePfcPayload({
        thoughtType: 'tool-execution',
        content: 'tool=search approved',
      }))
    })

    expect(screen.getByText('Using search')).toBeTruthy()
  })

  it('shows reflection as "Reflecting…" (Q5)', () => {
    renderSendingPanel()

    act(() => {
      emitEvent('thought:pfc-decision', makePfcPayload({
        thoughtType: 'reflection',
        content: 'self-check',
      }))
    })

    expect(screen.getByText('Reflecting\u2026')).toBeTruthy()
  })

  it('shows turn-complete as "Done" (Q5)', () => {
    renderSendingPanel()

    act(() => {
      emitEvent('thought:turn-lifecycle', makeLifecyclePayload({
        phase: 'turn-complete',
        status: 'completed',
      }))
    })

    expect(screen.getByText('Done')).toBeTruthy()
  })

  it('suppresses turn-start, opctl-check, stm-finalize, trace-record, response-resolved (Q5)', () => {
    renderSendingPanel()

    act(() => {
      emitEvent('thought:turn-lifecycle', makeLifecyclePayload({ phase: 'turn-start', status: 'started' }))
      emitEvent('thought:turn-lifecycle', makeLifecyclePayload({ phase: 'opctl-check', status: 'completed' }))
      emitEvent('thought:turn-lifecycle', makeLifecyclePayload({ phase: 'stm-finalize', status: 'completed' }))
      emitEvent('thought:turn-lifecycle', makeLifecyclePayload({ phase: 'trace-record', status: 'completed' }))
      emitEvent('thought:turn-lifecycle', makeLifecyclePayload({ phase: 'response-resolved', status: 'completed' }))
    })

    // None of these produce inline thought items
    expect(screen.queryByTestId('inline-thought-group')).toBeNull()
  })

  it('suppresses memory-write, memory-mutation, escalation PFC decisions (Q5)', () => {
    renderSendingPanel()

    act(() => {
      emitEvent('thought:pfc-decision', makePfcPayload({ thoughtType: 'memory-write' }))
      emitEvent('thought:pfc-decision', makePfcPayload({ thoughtType: 'memory-mutation' }))
      emitEvent('thought:pfc-decision', makePfcPayload({ thoughtType: 'escalation' }))
    })

    expect(screen.queryByTestId('inline-thought-group')).toBeNull()
  })

  it('accumulates multiple inline items for the same turn', () => {
    renderSendingPanel()

    act(() => {
      emitEvent('thought:turn-lifecycle', makeLifecyclePayload({ phase: 'gateway-run', status: 'started' }))
      emitEvent('thought:pfc-decision', makePfcPayload({ thoughtType: 'tool-execution', content: 'tool=search approved', sequence: 2 }))
      emitEvent('thought:pfc-decision', makePfcPayload({ thoughtType: 'reflection', content: 'self-check', sequence: 3 }))
    })

    const items = screen.getAllByTestId('inline-thought-item')
    expect(items.length).toBe(3)
    expect(screen.getByText('Thinking\u2026')).toBeTruthy()
    expect(screen.getByText('Using search')).toBeTruthy()
    expect(screen.getByText('Reflecting\u2026')).toBeTruthy()
  })

  it('thoughts anchor to completed assistant message after send resolves (Q1)', async () => {
    const { resolveSend } = renderSendingPanel()

    act(() => {
      emitEvent('thought:turn-lifecycle', makeLifecyclePayload({ phase: 'gateway-run', status: 'started' }))
    })

    // Active group exists
    expect(screen.getByTestId('inline-thought-group')).toBeTruthy()

    // Resolve send — assistant message arrives with traceId
    await act(async () => {
      resolveSend({ response: 'Hello!', traceId: 'trace-1' })
    })

    // Thoughts now anchored to the assistant message (collapsed)
    const group = screen.getByTestId('inline-thought-group')
    expect(group).toBeTruthy()
    // Collapsed: shows "1 action"
    expect(screen.getByText('1 action')).toBeTruthy()
  })

  it('collapsed thought group can be expanded to show items (Q3)', async () => {
    const { resolveSend } = renderSendingPanel()

    act(() => {
      emitEvent('thought:turn-lifecycle', makeLifecyclePayload({ phase: 'gateway-run', status: 'started' }))
      emitEvent('thought:pfc-decision', makePfcPayload({ thoughtType: 'tool-execution', content: 'tool=memory approved', sequence: 2 }))
    })

    await act(async () => {
      resolveSend({ response: 'Done', traceId: 'trace-1' })
    })

    // Collapsed: "2 actions"
    expect(screen.getByText('2 actions')).toBeTruthy()

    // Expand
    fireEvent.click(screen.getByTestId('inline-thought-group'))
    expect(screen.getByText('Thinking\u2026')).toBeTruthy()
    expect(screen.getByText('Using memory')).toBeTruthy()
  })
})

describe('ChatPanel — Ambient teleprompter (Q4)', () => {
  beforeEach(() => {
    latestCallbacks.clear()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ambient_large shows teleprompter instead of message list', () => {
    const mockApi: ChatAPI = {
      send: vi.fn().mockResolvedValue({ response: 'ok', traceId: 'trace-1' }),
      getHistory: async () => [],
    }

    render(<ChatPanel chatApi={mockApi} stage="ambient_large" />)

    // No message list elements
    expect(screen.queryByTestId('inline-thought-group')).toBeNull()
    // Teleprompter renders when items exist
    expect(screen.queryByTestId('ambient-teleprompter')).toBeNull() // no events yet
  })

  it('ambient_large teleprompter shows filtered prose items', () => {
    const mockApi: ChatAPI = {
      send: vi.fn().mockResolvedValue({ response: 'ok', traceId: 'trace-1' }),
      getHistory: async () => [],
    }

    render(<ChatPanel chatApi={mockApi} stage="ambient_large" />)

    act(() => {
      emitEvent('thought:turn-lifecycle', makeLifecyclePayload({ phase: 'gateway-run', status: 'started' }))
    })

    const teleprompter = screen.getByTestId('ambient-teleprompter')
    expect(teleprompter).toBeTruthy()
    expect(screen.getByText('Thinking\u2026')).toBeTruthy()
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

    expect(container.querySelector('[data-chat-stage="full"]')).toBeTruthy()
    expect(screen.getByPlaceholderText(/What can I help you with/i)).toBeTruthy()
  })

  it('renders full mode explicitly when stage="full"', () => {
    const mockApi: ChatAPI = {
      send: vi.fn().mockResolvedValue({ response: 'ok', traceId: 'trace-1' }),
      getHistory: async () => [],
    }
    const { container } = render(<ChatPanel chatApi={mockApi} stage="full" />)

    expect(container.querySelector('[data-chat-stage="full"]')).toBeTruthy()
    expect(screen.getByPlaceholderText(/What can I help you with/i)).toBeTruthy()
  })

  it('small stage hides header and messages, shows only input', () => {
    const mockApi: ChatAPI = {
      send: vi.fn().mockResolvedValue({ response: 'ok', traceId: 'trace-1' }),
      getHistory: async () => [],
    }
    const { container } = render(<ChatPanel chatApi={mockApi} stage="small" />)

    expect(container.querySelector('[data-chat-stage="small"]')).toBeTruthy()
    expect(screen.queryByText('Principal \u2194 Cortex')).toBeNull()
    expect(screen.getByPlaceholderText(/What can I help you with/i)).toBeTruthy()
    expect(screen.getByTitle('Send message')).toBeTruthy()
  })

  it('ambient_small stage shows input', () => {
    const mockApi: ChatAPI = {
      send: vi.fn().mockResolvedValue({ response: 'ok', traceId: 'trace-1' }),
      getHistory: async () => [],
    }
    const { container } = render(<ChatPanel chatApi={mockApi} stage="ambient_small" />)

    expect(container.querySelector('[data-chat-stage="ambient_small"]')).toBeTruthy()
    expect(screen.getByPlaceholderText(/What can I help you with/i)).toBeTruthy()
  })

  it('ambient_large stage shows input', () => {
    const mockApi: ChatAPI = {
      send: vi.fn().mockResolvedValue({ response: 'ok', traceId: 'trace-1' }),
      getHistory: async () => [],
    }
    const { container } = render(<ChatPanel chatApi={mockApi} stage="ambient_large" />)

    expect(container.querySelector('[data-chat-stage="ambient_large"]')).toBeTruthy()
    expect(screen.getByPlaceholderText(/What can I help you with/i)).toBeTruthy()
  })

  it('input focus calls onInputFocus callback', () => {
    const mockApi: ChatAPI = {
      send: vi.fn().mockResolvedValue({ response: 'ok', traceId: 'trace-1' }),
      getHistory: async () => [],
    }
    const onInputFocus = vi.fn()

    render(<ChatPanel chatApi={mockApi} stage="ambient_small" onInputFocus={onInputFocus} />)

    const textarea = screen.getByPlaceholderText(/What can I help you with/i)
    fireEvent.focus(textarea)
    expect(onInputFocus).toHaveBeenCalledTimes(1)
  })

  it('ambient_large stage shows only last 5 messages (not visible in ambient_large — teleprompter only)', async () => {
    const mockApi: ChatAPI = {
      send: vi.fn().mockResolvedValue({ response: 'ok', traceId: 'trace-1' }),
      getHistory: async () => [],
    }

    const { container } = render(<ChatPanel chatApi={mockApi} stage="ambient_large" />)

    expect(container.querySelector('[data-chat-stage="ambient_large"]')).toBeTruthy()
    expect(screen.queryByText('Principal \u2194 Cortex')).toBeNull()
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
