// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest'
import {
  makeTrpcMock,
  setMockHistoryFromChatMessages,
  setMockHistoryEntries,
} from './chat-panel-trpc-mock'

vi.mock('@nous/transport', () => makeTrpcMock())

import { ChatPanel } from '../ChatPanel'
import type { ChatAPI, ChatMessage } from '../ChatPanel'

beforeAll(() => {
  // jsdom does not implement scrollIntoView
  Element.prototype.scrollIntoView = () => {}
})

beforeEach(() => {
  setMockHistoryEntries([])
})

// SP 1.9 Plan Task #14 — `chatApi.getHistory()` is no longer called by
// ChatPanel (history flows through the `trpc.chat.getHistory.useQuery`
// subscription). Tests that previously passed messages via
// `makeChatApi(messages).getHistory()` now seed the useQuery mock via
// `setMockHistoryFromChatMessages(messages)` BEFORE render. The returned
// `ChatAPI` retains a no-op `getHistory` for test-fixture compatibility.
function makeChatApi(messages: ChatMessage[]): ChatAPI {
  setMockHistoryFromChatMessages(messages)
  return {
    send: async () => ({ response: 'ok', traceId: '123' }),
    getHistory: async () => messages,
  }
}

describe('ChatPanel — Content Detection and Renderer Branching', () => {
  // ---------------------------------------------------------------------------
  // Tier 2 — Behavior: Content detection
  // ---------------------------------------------------------------------------

  it('assistant message with contentType text: renders plain text, no card container', async () => {
    const api = makeChatApi([
      { role: 'assistant', content: 'Hello world', timestamp: '2026-01-01T00:00:00Z', contentType: 'text' },
    ])
    render(<ChatPanel chatApi={api} />)
    // Wait for getHistory to populate
    expect(await screen.findByText('Hello world')).toBeTruthy()
    expect(screen.queryByTestId('openui-card-container')).toBeNull()
  })

  it('assistant message with contentType openui and valid markup: renders card container', async () => {
    const api = makeChatApi([
      {
        role: 'assistant',
        content: '<StatusCard title="Test" status="active" description="Hi" />',
        timestamp: '2026-01-01T00:00:00Z',
        contentType: 'openui',
      },
    ])
    render(<ChatPanel chatApi={api} />)
    expect(await screen.findByTestId('openui-card-container')).toBeTruthy()
  })

  it('assistant message with absent contentType and %%openui\\n prefix: renders card (prefix fallback)', async () => {
    const api = makeChatApi([
      {
        role: 'assistant',
        content: '%%openui\n<StatusCard title="Fallback" status="active" description="Fb" />',
        timestamp: '2026-01-01T00:00:00Z',
      },
    ])
    render(<ChatPanel chatApi={api} />)
    expect(await screen.findByTestId('openui-card-container')).toBeTruthy()
  })

  it('assistant message with absent contentType and no prefix: renders plain text', async () => {
    const api = makeChatApi([
      { role: 'assistant', content: 'Regular text.', timestamp: '2026-01-01T00:00:00Z' },
    ])
    render(<ChatPanel chatApi={api} />)
    expect(await screen.findByText('Regular text.')).toBeTruthy()
    expect(screen.queryByTestId('openui-card-container')).toBeNull()
  })

  it('assistant message with contentType openui but no card tags: renders as plain text (segment splitter finds no cards)', async () => {
    const api = makeChatApi([
      {
        role: 'assistant',
        content: 'this is not valid card markup at all',
        timestamp: '2026-01-01T00:00:00Z',
        contentType: 'openui',
      },
    ])
    render(<ChatPanel chatApi={api} />)
    // Segment splitter finds no card tags, so content renders as plain text
    expect(await screen.findByText('this is not valid card markup at all')).toBeTruthy()
    expect(screen.queryByTestId('openui-card-container')).toBeNull()
  })

  it('user message: always plain text regardless of content', async () => {
    const api = makeChatApi([
      {
        role: 'user',
        content: '<StatusCard title="Fake" status="active" description="M" />',
        timestamp: '2026-01-01T00:00:00Z',
        contentType: 'openui' as any,
      },
    ])
    render(<ChatPanel chatApi={api} />)
    // User messages should render as plain text
    expect(await screen.findByText('<StatusCard title="Fake" status="active" description="M" />')).toBeTruthy()
    expect(screen.queryByTestId('openui-card-container')).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // Tier 2 — Behavior: Stale detection
  // ---------------------------------------------------------------------------

  it('multiple assistant messages: only last one is live, others are stale', async () => {
    const api = makeChatApi([
      {
        role: 'assistant',
        content: '<StatusCard title="Old" status="complete" description="Done" />',
        timestamp: '2026-01-01T00:00:00Z',
        contentType: 'openui',
      },
      { role: 'user', content: 'next', timestamp: '2026-01-01T00:01:00Z' },
      {
        role: 'assistant',
        content: '<StatusCard title="New" status="active" description="Current" />',
        timestamp: '2026-01-01T00:02:00Z',
        contentType: 'openui',
      },
    ])
    render(<ChatPanel chatApi={api} />)
    const containers = await screen.findAllByTestId('openui-card-container')
    expect(containers).toHaveLength(2)
    // First card should be stale
    expect(screen.getAllByTestId('stale-card')).toHaveLength(1)
  })

  it('message with actionOutcome: rendered as stale', async () => {
    const api = makeChatApi([
      {
        role: 'assistant',
        content: '<StatusCard title="Actioned" status="complete" description="Done" />',
        timestamp: '2026-01-01T00:00:00Z',
        contentType: 'openui',
        actionOutcome: { actionType: 'approve', label: 'Approved', timestamp: '2026-01-01T00:01:00Z' },
      },
    ])
    render(<ChatPanel chatApi={api} />)
    expect(await screen.findByTestId('stale-card')).toBeTruthy()
    expect(screen.getByTestId('action-outcome-badge')).toBeTruthy()
    // "Approved" text appears in both card renderer and outcome badge — use getAllByText
    expect(screen.getAllByText('Approved').length).toBeGreaterThanOrEqual(1)
  })

  it('single assistant card message that is latest: treated as live (not stale)', async () => {
    const api = makeChatApi([
      {
        role: 'assistant',
        content: '<StatusCard title="Live" status="active" description="Current" />',
        timestamp: '2026-01-01T00:00:00Z',
        contentType: 'openui',
      },
    ])
    render(<ChatPanel chatApi={api} />)
    const container = await screen.findByTestId('openui-card-container')
    expect(container).toBeTruthy()
    expect(screen.queryByTestId('stale-card')).toBeNull()
  })

  it('assistant message with contentType openui but hallucinated card type: sanitized by MarkdownRenderer', async () => {
    const hallucinated = '<HaikuCard title="Poetic moment" message="Snowflakes" />'
    const api = makeChatApi([
      {
        role: 'assistant',
        content: hallucinated,
        timestamp: '2026-01-01T00:00:00Z',
        contentType: 'openui',
      },
    ])
    const { container } = render(<ChatPanel chatApi={api} />)

    // Wait for history to load
    await screen.findByPlaceholderText(/What can I help you with/i)
    // Allow async getHistory to settle
    await new Promise(r => setTimeout(r, 50))

    // HaikuCard is not a registered card type → not routed through card pipeline
    expect(screen.queryByTestId('openui-card-container')).toBeNull()
    expect(screen.queryByTestId('unknown-card-fallback')).toBeNull()
    // Self-closing unknown HTML tags are sanitized (stripped) by MarkdownRenderer's
    // rehype-sanitize strict preset — this is correct security behavior.
    // The container renders without crashing.
    expect(container).toBeTruthy()
  })

  // ---------------------------------------------------------------------------
  // Tier 3 — Edge Cases
  // ---------------------------------------------------------------------------

  it('empty messages array: no crash, renders cleanly', async () => {
    const api = makeChatApi([])
    const { container } = render(<ChatPanel chatApi={api} />)
    // Should render without crashing; no empty state text is shown
    expect(container.querySelector('[data-chat-stage="full"]')).toBeTruthy()
  })

  it('rendering never throws even on unexpected input', async () => {
    // Test that ChatPanel doesn't crash with weird message content
    const api = makeChatApi([
      { role: 'assistant', content: '', timestamp: '2026-01-01T00:00:00Z', contentType: 'openui' },
    ])
    expect(() => render(<ChatPanel chatApi={api} />)).not.toThrow()
  })

  it('stale card with both actionOutcome and historical position: still stale (OR logic)', async () => {
    const api = makeChatApi([
      {
        role: 'assistant',
        content: '<StatusCard title="Old" status="complete" description="Done" />',
        timestamp: '2026-01-01T00:00:00Z',
        contentType: 'openui',
        actionOutcome: { actionType: 'approve', label: 'Done', timestamp: '2026-01-01T00:01:00Z' },
      },
      { role: 'user', content: 'next', timestamp: '2026-01-01T00:02:00Z' },
      {
        role: 'assistant',
        content: '<StatusCard title="New" status="active" description="Cur" />',
        timestamp: '2026-01-01T00:03:00Z',
        contentType: 'openui',
      },
    ])
    render(<ChatPanel chatApi={api} />)
    // Both stale indicators: historical position AND actionOutcome
    expect(await screen.findByTestId('stale-card')).toBeTruthy()
  })
})
