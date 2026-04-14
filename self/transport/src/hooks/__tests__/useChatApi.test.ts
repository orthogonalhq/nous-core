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
