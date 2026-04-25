// @vitest-environment jsdom

import React from 'react'
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useCardActionHandler } from '../useCardActionHandler'
import { ShellProvider } from '../../../shell/ShellContext'
import type { CardAction } from '../../openui-adapter/types'
import type { ChatMessage } from '../../../../panels/ChatPanel'
import type { LocalOverlayEntry } from '../../../../panels/chat/merge-overlay'

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
      traceId: 't1',
    },
  ]
}

describe('useCardActionHandler', () => {
  let chatApi: ReturnType<typeof createMockChatApi>
  let setLocalOverlay: ReturnType<typeof vi.fn>
  let messages: ChatMessage[]

  beforeEach(() => {
    vi.clearAllMocks()
    chatApi = createMockChatApi()
    setLocalOverlay = vi.fn()
    messages = createMessages()
  })

  // ── Tier 2: Behavior Tests ──────────────────────────────────────────────

  it('navigate action calls useShellContext().navigate() with payload.panel', () => {
    const { result } = renderHook(
      () => useCardActionHandler({ chatApi, setLocalOverlay, messages }),
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

    expect(mockNavigate).toHaveBeenCalledWith('settings', undefined)
  })

  it('navigate action with extra payload fields forwards them as params', () => {
    const { result } = renderHook(
      () => useCardActionHandler({ chatApi, setLocalOverlay, messages }),
      { wrapper: createWrapper() },
    )

    const action: CardAction = {
      actionType: 'navigate',
      cardId: 'card-1',
      payload: { panel: 'workflow-builder', projectId: 'p1', definitionId: 'd1' },
    }

    act(() => {
      result.current(action, 1)
    })

    expect(mockNavigate).toHaveBeenCalledWith('workflow-builder', { projectId: 'p1', definitionId: 'd1' })
  })

  it('navigate action with only panel passes undefined params', () => {
    const { result } = renderHook(
      () => useCardActionHandler({ chatApi, setLocalOverlay, messages }),
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

    expect(mockNavigate).toHaveBeenCalledWith('observe', undefined)
  })

  it('navigate action does NOT call chatApi.sendAction', () => {
    const { result } = renderHook(
      () => useCardActionHandler({ chatApi, setLocalOverlay, messages }),
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
      () => useCardActionHandler({ chatApi, setLocalOverlay, messages }),
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

  // SP 1.9 Item 1 — Axis C case 4: card-outcome overlay push uses traceId
  // when the target message has one. Replaces the SP 1.8 `setMessages.map`
  // assertion (Invariant H — old path deleted in same PR).
  it('after successful action, card-outcome overlay entry is pushed with the right key', async () => {
    const { result } = renderHook(
      () => useCardActionHandler({ chatApi, setLocalOverlay, messages }),
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

    expect(setLocalOverlay).toHaveBeenCalled()
    // Get the updater function and call it with empty overlay
    const updater = setLocalOverlay.mock.calls[0][0] as (
      prev: readonly LocalOverlayEntry[],
    ) => readonly LocalOverlayEntry[]
    const next = updater([])
    expect(next).toHaveLength(1)
    const entry = next[0]
    expect(entry.kind).toBe('card-outcome')
    if (entry.kind === 'card-outcome') {
      // messages[1] has traceId 't1' so the key uses the traceId.
      expect(entry.traceIdOrIndexKey).toBe('t1')
      expect(entry.key).toBe('t1:approve')
      expect(entry.actionOutcome.actionType).toBe('approve')
      expect(entry.actionOutcome.label).toBe('approve')
      expect(typeof entry.actionOutcome.timestamp).toBe('string')
      expect(new Date(entry.actionOutcome.timestamp).toISOString()).toBe(entry.actionOutcome.timestamp)
    }
  })

  // SP 1.9 Item 1 — Axis C case 5: pre-traceId fallback. Target message has
  // no `traceId` so the overlay key falls back to `idx-${i}`.
  it('pre-traceId fallback: overlay entry uses idx-${i} when target has no traceId', async () => {
    const noTrace: ChatMessage[] = [
      { role: 'user', content: 'Hi', timestamp: '2026-01-01T00:00:00Z' },
      {
        role: 'assistant',
        content: '<Card />',
        timestamp: '2026-01-01T00:01:00Z',
        contentType: 'openui',
      },
    ]

    const { result } = renderHook(
      () => useCardActionHandler({ chatApi, setLocalOverlay, messages: noTrace }),
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

    const updater = setLocalOverlay.mock.calls[0][0] as (
      prev: readonly LocalOverlayEntry[],
    ) => readonly LocalOverlayEntry[]
    const next = updater([])
    expect(next).toHaveLength(1)
    const entry = next[0]
    expect(entry.kind).toBe('card-outcome')
    if (entry.kind === 'card-outcome') {
      expect(entry.traceIdOrIndexKey).toBe('idx-1')
      expect(entry.key).toBe('idx-1:reject')
    }
  })

  it('followup action calls chatApi.sendAction', async () => {
    const { result } = renderHook(
      () => useCardActionHandler({ chatApi, setLocalOverlay, messages }),
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

  it('action on out-of-bounds message index does not crash; uses idx fallback', async () => {
    const { result } = renderHook(
      () => useCardActionHandler({ chatApi, setLocalOverlay, messages }),
      { wrapper: createWrapper() },
    )

    const action: CardAction = {
      actionType: 'approve',
      cardId: 'card-5',
      payload: {},
    }

    // Should not throw even with an out-of-bounds index (target lookup
    // resolves to undefined; fallback key is `idx-999:approve`).
    await act(async () => {
      result.current(action, 999)
      await new Promise(r => setTimeout(r, 0))
    })

    expect(setLocalOverlay).toHaveBeenCalled()
    const updater = setLocalOverlay.mock.calls[0][0] as (
      prev: readonly LocalOverlayEntry[],
    ) => readonly LocalOverlayEntry[]
    const next = updater([])
    expect(next).toHaveLength(1)
    const entry = next[0]
    expect(entry.kind).toBe('card-outcome')
    if (entry.kind === 'card-outcome') {
      expect(entry.traceIdOrIndexKey).toBe('idx-999')
    }
  })

  it('does nothing when chatApi.sendAction is undefined', () => {
    const noSendApi = {} as { sendAction?: typeof chatApi.sendAction }
    const { result } = renderHook(
      () => useCardActionHandler({ chatApi: noSendApi, setLocalOverlay, messages }),
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

    // No crash, no setLocalOverlay call
    expect(setLocalOverlay).not.toHaveBeenCalled()
  })
})
