// @vitest-environment jsdom

import React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi, beforeAll } from 'vitest'
import type { ChatMessage } from '../types'

// ---------------------------------------------------------------------------
// Mocks — isolate ChatMessageList from heavy dependencies
// ---------------------------------------------------------------------------

// Mock MarkdownRenderer to verify it receives the right content
vi.mock('../../../components/chat', () => ({
  MarkdownRenderer: ({ content }: { content: string }) =>
    React.createElement('div', { 'data-testid': 'markdown-renderer', 'data-content': content }, content),
}))

// Mock ChatCardRenderer to verify card segments route correctly
vi.mock('../ChatCardRenderer', () => ({
  ChatCardRenderer: ({ content }: { content: string }) =>
    React.createElement('div', { 'data-testid': 'card-renderer', 'data-content': content }, content),
}))

// Mock splitMessageSegments for controlled test scenarios
vi.mock('../message-segments', () => ({
  splitMessageSegments: vi.fn(),
}))

// Mock ThoughtSummary — not relevant to rendering wiring
vi.mock('../../../components/thought', () => ({
  ThoughtSummary: () => null,
}))

// Mock InlineThoughtGroup
vi.mock('../InlineThoughtGroup', () => ({
  InlineThoughtGroup: () => null,
}))

import { ChatMessageList } from '../ChatMessageList'
import { splitMessageSegments } from '../message-segments'

const mockSplit = vi.mocked(splitMessageSegments)

beforeAll(() => {
  // jsdom does not implement scrollIntoView
  Element.prototype.scrollIntoView = () => {}
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderList(messages: ChatMessage[]) {
  return render(
    <ChatMessageList
      messages={messages}
      sending={false}
      thoughtsByTrace={new Map()}
      activeTraceId={null}
      onCardAction={() => {}}
    />,
  )
}

function makeMessage(role: 'user' | 'assistant', content: string, extra?: Partial<ChatMessage>): ChatMessage {
  return {
    role,
    content,
    timestamp: new Date().toISOString(),
    ...extra,
  }
}

// ---------------------------------------------------------------------------
// Tier 1 — Contract Tests
// ---------------------------------------------------------------------------

describe('ChatMessageList — contract', () => {
  it('renders without crashing with empty messages array', () => {
    const { container } = renderList([])
    expect(container).toBeTruthy()
  })

  it('renders without crashing with mixed message types', () => {
    mockSplit.mockReturnValue([{ type: 'text', content: 'Hello' }])
    const messages = [
      makeMessage('user', 'Hi there'),
      makeMessage('assistant', 'Hello'),
    ]
    const { container } = renderList(messages)
    expect(container).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Tier 2 — Behavior Tests
// ---------------------------------------------------------------------------

describe('ChatMessageList — behavior', () => {
  it('assistant text segments render through MarkdownRenderer', () => {
    mockSplit.mockReturnValue([
      { type: 'text', content: '**bold text** and _italic_' },
    ])
    const messages = [makeMessage('assistant', '**bold text** and _italic_')]
    const { container } = renderList(messages)

    const mdRenderers = container.querySelectorAll('[data-testid="markdown-renderer"]')
    expect(mdRenderers.length).toBeGreaterThanOrEqual(1)
    expect(mdRenderers[0].getAttribute('data-content')).toBe('**bold text** and _italic_')
  })

  it('user text segments render as plain text (no MarkdownRenderer)', () => {
    const messages = [makeMessage('user', '**not bold** just text')]
    const { container } = renderList(messages)

    // User messages should NOT use MarkdownRenderer
    const mdRenderers = container.querySelectorAll('[data-testid="markdown-renderer"]')
    expect(mdRenderers.length).toBe(0)

    // Content should be present as plain text
    expect(container.textContent).toContain('**not bold** just text')
  })

  it('card segments route through ChatCardRenderer', () => {
    mockSplit.mockReturnValue([
      { type: 'card', content: '<StatusCard title="Test" status="active" description="Hi" />' },
    ])
    const messages = [makeMessage('assistant', '<StatusCard title="Test" status="active" description="Hi" />')]
    const { container } = renderList(messages)

    const cardRenderers = container.querySelectorAll('[data-testid="card-renderer"]')
    expect(cardRenderers.length).toBe(1)
    expect(cardRenderers[0].getAttribute('data-content')).toContain('StatusCard')

    // Should NOT use MarkdownRenderer for card segments
    const mdRenderers = container.querySelectorAll('[data-testid="markdown-renderer"]')
    expect(mdRenderers.length).toBe(0)
  })

  it('mixed content (text + card segments) renders both correctly', () => {
    mockSplit.mockReturnValue([
      { type: 'text', content: 'Here are the results:' },
      { type: 'card', content: '<StatusCard title="Done" status="complete" description="OK" />' },
      { type: 'text', content: 'What would you like to do next?' },
    ])
    const messages = [makeMessage('assistant', 'Here are the results:\n<StatusCard ... />\nWhat would you like to do next?')]
    const { container } = renderList(messages)

    const mdRenderers = container.querySelectorAll('[data-testid="markdown-renderer"]')
    expect(mdRenderers.length).toBe(2)
    expect(mdRenderers[0].getAttribute('data-content')).toBe('Here are the results:')
    expect(mdRenderers[1].getAttribute('data-content')).toBe('What would you like to do next?')

    const cardRenderers = container.querySelectorAll('[data-testid="card-renderer"]')
    expect(cardRenderers.length).toBe(1)
  })

  it('JSON code block content renders through MarkdownRenderer', () => {
    const jsonContent = '```json\n{"key": "value"}\n```'
    mockSplit.mockReturnValue([
      { type: 'text', content: jsonContent },
    ])
    const messages = [makeMessage('assistant', jsonContent)]
    const { container } = renderList(messages)

    const mdRenderers = container.querySelectorAll('[data-testid="markdown-renderer"]')
    expect(mdRenderers.length).toBeGreaterThanOrEqual(1)
    expect(mdRenderers[0].getAttribute('data-content')).toBe(jsonContent)
  })
})

// ---------------------------------------------------------------------------
// Tier 3 — Edge Cases
// ---------------------------------------------------------------------------

describe('ChatMessageList — edge cases', () => {
  it('assistant message with no card segments renders through MarkdownRenderer', () => {
    // When splitMessageSegments returns no card segments (hasCardSegments = false),
    // the non-card branch should still use MarkdownRenderer
    mockSplit.mockReturnValue([
      { type: 'text', content: 'Just plain text' },
    ])
    const messages = [makeMessage('assistant', 'Just plain text')]
    const { container } = renderList(messages)

    const mdRenderers = container.querySelectorAll('[data-testid="markdown-renderer"]')
    expect(mdRenderers.length).toBeGreaterThanOrEqual(1)
  })

  it('empty assistant message content renders without error', () => {
    mockSplit.mockReturnValue([])
    const messages = [makeMessage('assistant', '')]
    const { container } = renderList(messages)
    expect(container).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// SP 1.15 RC-1 — Thinking disclosure auto-open behavior
// ---------------------------------------------------------------------------

describe('ChatMessageList — empty_response_kind auto-open (SP 1.15 RC-1)', () => {
  it('renders <details open> when message.empty_response_kind is set and thinkingContent is present', () => {
    mockSplit.mockReturnValue([{ type: 'text', content: 'marker text' }])
    const messages = [
      makeMessage('assistant', 'marker text', {
        thinkingContent: 'I considered options.',
        empty_response_kind: 'thinking_only_no_finalizer',
      }),
    ]
    const { container } = renderList(messages)
    const detailsEl = container.querySelector('details') as HTMLDetailsElement | null
    expect(detailsEl).not.toBeNull()
    expect(detailsEl!.open).toBe(true)
  })

  it('regression — <details> is closed (open=false) when empty_response_kind is undefined', () => {
    mockSplit.mockReturnValue([{ type: 'text', content: 'normal reply' }])
    const messages = [
      makeMessage('assistant', 'normal reply', {
        thinkingContent: 'Some background reasoning.',
      }),
    ]
    const { container } = renderList(messages)
    const detailsEl = container.querySelector('details') as HTMLDetailsElement | null
    expect(detailsEl).not.toBeNull()
    expect(detailsEl!.open).toBe(false)
  })

  it('renders no <details> element when empty_response_kind is set but neither thinkingContent nor thinking_unavailable is present', () => {
    // Disclosure exists only when there is thinking content OR a structural
    // thinking-unavailable signal. Guards against a false-positive open on
    // no-content.
    mockSplit.mockReturnValue([{ type: 'text', content: 'marker text' }])
    const messages = [
      makeMessage('assistant', 'marker text', {
        empty_response_kind: 'no_output_at_all',
      }),
    ]
    const { container } = renderList(messages)
    const detailsEl = container.querySelector('details')
    expect(detailsEl).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// SP 1.17 RC-α-1 — thinking-unavailable render branch (T-U1–T-U4)
// ---------------------------------------------------------------------------

describe('ChatMessageList — thinking_unavailable render branch (SP 1.17 RC-α-1)', () => {
  it('T-U1 — branch fires when thinking_unavailable is set and thinkingContent is absent → <details open> with <summary>Thinking</summary>', () => {
    mockSplit.mockReturnValue([{ type: 'text', content: 'Sure thing.' }])
    const messages = [
      makeMessage('assistant', 'Sure thing.', {
        thinking_unavailable: {
          reason: 'multi-turn request shape — provider/model template does not surface thinking',
          ref: 'WR-172',
        },
      }),
    ]
    const { container } = renderList(messages)
    const detailsEl = container.querySelector('details') as HTMLDetailsElement | null
    expect(detailsEl).not.toBeNull()
    expect(detailsEl!.open).toBe(true)
    const summary = detailsEl!.querySelector('summary')
    expect(summary?.textContent).toBe('Thinking')
  })

  it('T-U2 — branch does NOT fire when thinkingContent is also set (mutual exclusion — thinkingContent wins)', () => {
    mockSplit.mockReturnValue([{ type: 'text', content: 'Sure thing.' }])
    const messages = [
      makeMessage('assistant', 'Sure thing.', {
        thinkingContent: 'Real reasoning content',
        thinking_unavailable: {
          reason: 'should not be rendered',
          ref: 'WR-172',
        },
      }),
    ]
    const { container } = renderList(messages)
    // The thinking-unavailable acknowledgment substring must not appear when
    // thinkingContent wins.
    expect(container.textContent).not.toContain('Thinking unavailable on this turn')
  })

  it('T-U3 — rendered body contains the literal substring "WR-172" via the ref field', () => {
    mockSplit.mockReturnValue([{ type: 'text', content: 'Sure thing.' }])
    const messages = [
      makeMessage('assistant', 'Sure thing.', {
        thinking_unavailable: {
          reason: 'multi-turn request shape — provider/model template does not surface thinking',
          ref: 'WR-172',
        },
      }),
    ]
    const { container } = renderList(messages)
    expect(container.textContent).toContain('WR-172')
  })

  it('T-U4 — rendered body contains the structural reason text from the gateway derivation', () => {
    mockSplit.mockReturnValue([{ type: 'text', content: 'Sure thing.' }])
    const REASON = 'multi-turn request shape — provider/model template does not surface thinking'
    const messages = [
      makeMessage('assistant', 'Sure thing.', {
        thinking_unavailable: {
          reason: REASON,
          ref: 'WR-172',
        },
      }),
    ]
    const { container } = renderList(messages)
    expect(container.textContent).toContain(REASON)
  })
})
