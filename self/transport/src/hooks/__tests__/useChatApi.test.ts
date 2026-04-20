import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useChatApi } from '../useChatApi'

// ─── Mock tRPC client ──────────────────────────────────────────────────────────

const mockMutateAsync = {
  sendMessage: vi.fn(),
  sendAction: vi.fn(),
}

const mockFetch = {
  getHistory: vi.fn(),
}

const mockInvalidate = {
  getHistory: vi.fn(),
}

vi.mock('../../client', () => ({
  trpc: {
    useUtils: () => ({
      chat: {
        getHistory: {
          fetch: mockFetch.getHistory,
          invalidate: mockInvalidate.getHistory,
        },
      },
    }),
    chat: {
      sendMessage: {
        useMutation: () => ({ mutateAsync: mockMutateAsync.sendMessage }),
      },
      sendAction: {
        useMutation: () => ({ mutateAsync: mockMutateAsync.sendAction }),
      },
    },
  },
}))

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('useChatApi — getHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps thinkingContent from entry metadata', async () => {
    mockFetch.getHistory.mockResolvedValueOnce({
      entries: [
        { role: 'user', content: 'Hello', timestamp: '2026-04-14T00:00:00Z' },
        {
          role: 'assistant',
          content: 'Hi there',
          timestamp: '2026-04-14T00:00:01Z',
          metadata: { thinkingContent: 'I should greet the user warmly' },
        },
      ],
      summary: undefined,
      tokenCount: 0,
    })

    const { result } = renderHook(() => useChatApi({ projectId: 'proj-1' }))
    const history = await result.current.getHistory()

    expect(history).toHaveLength(2)
    expect(history[1].thinkingContent).toBe('I should greet the user warmly')
  })

  it('omits thinkingContent when not present in metadata (backward compat)', async () => {
    mockFetch.getHistory.mockResolvedValueOnce({
      entries: [
        { role: 'user', content: 'Hello', timestamp: '2026-04-14T00:00:00Z' },
        {
          role: 'assistant',
          content: 'Hi there',
          timestamp: '2026-04-14T00:00:01Z',
          metadata: { contentType: 'text' },
        },
      ],
      summary: undefined,
      tokenCount: 0,
    })

    const { result } = renderHook(() => useChatApi({ projectId: 'proj-1' }))
    const history = await result.current.getHistory()

    expect(history[1]).not.toHaveProperty('thinkingContent')
  })

  it('handles entries with no metadata at all', async () => {
    mockFetch.getHistory.mockResolvedValueOnce({
      entries: [
        { role: 'user', content: 'Hello', timestamp: '2026-04-14T00:00:00Z' },
        { role: 'assistant', content: 'Hi', timestamp: '2026-04-14T00:00:01Z' },
      ],
      summary: undefined,
      tokenCount: 0,
    })

    const { result } = renderHook(() => useChatApi({ projectId: 'proj-1' }))
    const history = await result.current.getHistory()

    expect(history).toHaveLength(2)
    expect(history[0]).not.toHaveProperty('thinkingContent')
    expect(history[1]).not.toHaveProperty('thinkingContent')
  })
})

describe('useChatApi — sessionId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('send passes sessionId to mutation when provided', async () => {
    mockMutateAsync.sendMessage.mockResolvedValueOnce({
      response: 'Reply', traceId: 'trace-1', contentType: 'text',
    })

    const { result } = renderHook(() => useChatApi({ projectId: 'proj-1', sessionId: 'sess-abc' }))
    await result.current.send('Hello')

    expect(mockMutateAsync.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Hello', projectId: 'proj-1', sessionId: 'sess-abc' }),
    )
  })

  it('getHistory passes sessionId to fetch when provided', async () => {
    mockFetch.getHistory.mockResolvedValueOnce({
      entries: [], summary: undefined, tokenCount: 0,
    })

    const { result } = renderHook(() => useChatApi({ projectId: 'proj-1', sessionId: 'sess-abc' }))
    await result.current.getHistory()

    expect(mockFetch.getHistory).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'proj-1', sessionId: 'sess-abc' }),
    )
  })

  it('identity changes when sessionId changes', () => {
    const { result, rerender } = renderHook(
      ({ sessionId }) => useChatApi({ projectId: 'proj-1', sessionId }),
      { initialProps: { sessionId: 'sess-1' } },
    )

    const api1 = result.current
    rerender({ sessionId: 'sess-2' })
    const api2 = result.current

    expect(api1).not.toBe(api2)
  })

  it('sendAction passes sessionId when provided', async () => {
    mockMutateAsync.sendAction.mockResolvedValueOnce({ ok: true, message: 'done' })

    const { result } = renderHook(() => useChatApi({ projectId: 'proj-1', sessionId: 'sess-abc' }))
    await result.current.sendAction({ actionType: 'approve', cardId: 'c1', payload: {} } as any)

    expect(mockMutateAsync.sendAction).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'sess-abc' }),
    )
  })
})

describe('useChatApi — sendAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Tier 1: Contract ────────────────────────────────────────────────────

  it('returned object has sendAction method', () => {
    const { result } = renderHook(() => useChatApi())
    expect(typeof result.current.sendAction).toBe('function')
  })

  // ── Tier 2: Behavior ───────────────────────────────────────────────────

  it('sendAction calls chat.sendAction tRPC mutation with correct payload', async () => {
    const mockResult = { ok: true, message: 'Action submitted', traceId: 'run-1' }
    mockMutateAsync.sendAction.mockResolvedValueOnce(mockResult)

    const { result } = renderHook(() => useChatApi())
    const action = { actionType: 'approve' as const, cardId: 'card-1', payload: { reason: 'lgtm' } }
    const data = await result.current.sendAction(action)

    expect(mockMutateAsync.sendAction).toHaveBeenCalledWith({ action })
    expect(data).toEqual(mockResult)
  })

  it('sendAction includes projectId when provided', async () => {
    const mockResult = { ok: true, message: 'Action submitted' }
    mockMutateAsync.sendAction.mockResolvedValueOnce(mockResult)

    const { result } = renderHook(() => useChatApi({ projectId: 'proj-1' }))
    const action = { actionType: 'followup' as const, cardId: 'card-2', payload: { prompt: 'more' } }
    await result.current.sendAction(action)

    expect(mockMutateAsync.sendAction).toHaveBeenCalledWith({ action, projectId: 'proj-1' })
  })

  it('sendAction returns ActionResult from mutation', async () => {
    const mockResult = { ok: true, message: 'Follow-up response', traceId: 'trace-abc', contentType: 'text' as const }
    mockMutateAsync.sendAction.mockResolvedValueOnce(mockResult)

    const { result } = renderHook(() => useChatApi())
    const action = { actionType: 'followup' as const, cardId: 'card-3', payload: { prompt: 'details' } }
    const data = await result.current.sendAction(action)

    expect(data.ok).toBe(true)
    expect(data.message).toBe('Follow-up response')
    expect(data.traceId).toBe('trace-abc')
  })
})
