// @vitest-environment jsdom

import React from 'react'
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useCardActionHandler } from '../useCardActionHandler'
import { ShellProvider } from '../../../shell/ShellContext'
import type { CardAction } from '../../openui-adapter/types'
import type { ChatMessage } from '../../../../panels/ChatPanel'

const mockNavigate = vi.fn()

function createWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      ShellProvider,
      { navigate: mockNavigate },
      children,
    )
  }
}

function createMockChatApi() {
  return {
    sendAction: vi.fn().mockResolvedValue({ ok: true, message: 'Action submitted' }),
  }
}

function createMessages(): ChatMessage[] {
  return [
    { role: 'user', content: 'Hello', timestamp: '2026-01-01T00:00:00Z' },
    {
      role: 'assistant',
      content: '<ActionCard title="Test" description="Do something" />',
      timestamp: '2026-01-01T00:01:00Z',
      contentType: 'openui' as const,
    },
  ]
}

describe('useCardActionHandler', () => {
  let chatApi: ReturnType<typeof createMockChatApi>
  let setMessages: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    chatApi = createMockChatApi()
    setMessages = vi.fn()
  })

  // ── Tier 2: Behavior Tests ──────────────────────────────────────────────

  it('navigate action calls useShellContext().navigate() with payload.panel', () => {
    const { result } = renderHook(
      () => useCardActionHandler({ chatApi, setMessages }),
      { wrapper: createWrapper() },
    )

    const action: CardAction = {
      actionType: 'navigate',
      cardId: 'card-1',
      payload: { panel: 'settings' },
    }

    act(() => {
      result.current(action, 1)
    })

    expect(mockNavigate).toHaveBeenCalledWith('settings')
  })

  it('navigate action does NOT call chatApi.sendAction', () => {
    const { result } = renderHook(
      () => useCardActionHandler({ chatApi, setMessages }),
      { wrapper: createWrapper() },
    )

    const action: CardAction = {
      actionType: 'navigate',
      cardId: 'card-1',
      payload: { panel: 'observe' },
    }

    act(() => {
      result.current(action, 1)
    })

    expect(chatApi.sendAction).not.toHaveBeenCalled()
  })

  it('approve action calls chatApi.sendAction with the action', async () => {
    const { result } = renderHook(
      () => useCardActionHandler({ chatApi, setMessages }),
      { wrapper: createWrapper() },
    )

    const action: CardAction = {
      actionType: 'approve',
      cardId: 'card-2',
      payload: { reason: 'approved' },
    }

    await act(async () => {
      result.current(action, 1)
      // Wait for the promise to resolve
      await new Promise(r => setTimeout(r, 0))
    })

    expect(chatApi.sendAction).toHaveBeenCalledWith(action)
  })

  it('after successful action, actionOutcome is set on message at correct index', async () => {
    const { result } = renderHook(
      () => useCardActionHandler({ chatApi, setMessages }),
      { wrapper: createWrapper() },
    )

    const action: CardAction = {
      actionType: 'approve',
      cardId: 'card-2',
      payload: {},
    }

    await act(async () => {
      result.current(action, 1)
      await new Promise(r => setTimeout(r, 0))
    })

    expect(setMessages).toHaveBeenCalled()
    // Get the updater function and call it with mock messages
    const updater = setMessages.mock.calls[0][0]
    const messages = createMessages()
    const updated = updater(messages)

    // Index 0 (user message) should be unchanged
    expect(updated[0].actionOutcome).toBeUndefined()
    // Index 1 (assistant card message) should have actionOutcome
    expect(updated[1].actionOutcome).toBeDefined()
    expect(updated[1].actionOutcome.actionType).toBe('approve')
  })

  it('actionOutcome contains correct actionType and timestamp', async () => {
    const { result } = renderHook(
      () => useCardActionHandler({ chatApi, setMessages }),
      { wrapper: createWrapper() },
    )

    const action: CardAction = {
      actionType: 'reject',
      cardId: 'card-3',
      payload: {},
    }

    await act(async () => {
      result.current(action, 1)
      await new Promise(r => setTimeout(r, 0))
    })

    const updater = setMessages.mock.calls[0][0]
    const updated = updater(createMessages())

    expect(updated[1].actionOutcome.actionType).toBe('reject')
    expect(updated[1].actionOutcome.label).toBe('reject')
    expect(typeof updated[1].actionOutcome.timestamp).toBe('string')
    // Timestamp should be a valid ISO string
    expect(new Date(updated[1].actionOutcome.timestamp).toISOString()).toBe(updated[1].actionOutcome.timestamp)
  })

  it('followup action calls chatApi.sendAction', async () => {
    const { result } = renderHook(
      () => useCardActionHandler({ chatApi, setMessages }),
      { wrapper: createWrapper() },
    )

    const action: CardAction = {
      actionType: 'followup',
      cardId: 'card-4',
      payload: { prompt: 'Tell me more' },
    }

    await act(async () => {
      result.current(action, 1)
      await new Promise(r => setTimeout(r, 0))
    })

    expect(chatApi.sendAction).toHaveBeenCalledWith(action)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  // ── Tier 3: Edge Case Tests ─────────────────────────────────────────────

  it('action on out-of-bounds message index does not crash', async () => {
    const { result } = renderHook(
      () => useCardActionHandler({ chatApi, setMessages }),
      { wrapper: createWrapper() },
    )

    const action: CardAction = {
      actionType: 'approve',
      cardId: 'card-5',
      payload: {},
    }

    // Should not throw even with an out-of-bounds index
    await act(async () => {
      result.current(action, 999)
      await new Promise(r => setTimeout(r, 0))
    })

    // setMessages still called (functional update handles bounds gracefully via .map)
    expect(setMessages).toHaveBeenCalled()
  })

  it('does nothing when chatApi.sendAction is undefined', () => {
    const noSendApi = {} as { sendAction?: typeof chatApi.sendAction }
    const { result } = renderHook(
      () => useCardActionHandler({ chatApi: noSendApi, setMessages }),
      { wrapper: createWrapper() },
    )

    const action: CardAction = {
      actionType: 'approve',
      cardId: 'card-6',
      payload: {},
    }

    act(() => {
      result.current(action, 0)
    })

    // No crash, no setMessages call
    expect(setMessages).not.toHaveBeenCalled()
  })
})
