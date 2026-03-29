// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, beforeAll } from 'vitest'
import { ChatPanel } from '../ChatPanel'
import type { ChatAPI, ChatMessage, ChatPanelCoreProps } from '../ChatPanel'

beforeAll(() => {
  // jsdom does not implement scrollIntoView
  Element.prototype.scrollIntoView = () => {}
})

describe('ChatPanel', () => {
  // Tier 1 — Contract
  it('renders with ChatPanelCoreProps (without dockview wrapper) without crashing', () => {
    render(<ChatPanel />)
  })

  it('exports ChatAPI, ChatMessage, and ChatPanelCoreProps types', () => {
    // Type-level verification — if this compiles, the exports exist
    const _api: ChatAPI | undefined = undefined
    const _msg: ChatMessage | undefined = undefined
    const _props: ChatPanelCoreProps | undefined = undefined
    expect(_api).toBeUndefined()
    expect(_msg).toBeUndefined()
    expect(_props).toBeUndefined()
  })

  // Tier 2 — Behavior
  it('displays "Principal ↔ Cortex" when no conversationContext (backward compatibility)', () => {
    render(<ChatPanel />)
    expect(screen.getByText('Principal ↔ Cortex')).toBeTruthy()
  })

  it('displays thread indicator when conversationContext.threadId is non-null', () => {
    render(
      <ChatPanel
        conversationContext={{
          tier: 'thread',
          threadId: 'thread-abc-123',
          projectId: null,
          isAmbient: false,
        }}
      />,
    )
    expect(screen.getByTestId('thread-indicator')).toBeTruthy()
  })

  it('renders ambient badge when conversationContext.isAmbient is true', () => {
    render(
      <ChatPanel
        conversationContext={{
          tier: 'transient',
          threadId: null,
          projectId: null,
          isAmbient: true,
        }}
      />,
    )
    expect(screen.getByTestId('ambient-badge')).toBeTruthy()
  })

  it('displays header text "Ambient" when isAmbient and no threadId', () => {
    render(
      <ChatPanel
        conversationContext={{
          tier: 'transient',
          threadId: null,
          projectId: null,
          isAmbient: true,
        }}
      />,
    )
    // "Ambient" appears in both header span and badge — use getAllByText
    const ambientElements = screen.getAllByText('Ambient')
    expect(ambientElements.length).toBeGreaterThanOrEqual(1)
  })

  // Tier 3 — Edge cases
  it('renders with dockview-style { params: { chatApi } } props (existing usage pattern)', () => {
    const mockApi: ChatAPI = {
      send: async () => ({ response: 'test', traceId: '123' }),
      getHistory: async () => [],
    }
    // Cast to any: dockview IDockviewPanelProps also requires api/containerApi which we cannot construct in unit tests
    render(<ChatPanel {...{ params: { chatApi: mockApi } } as any} />)
    expect(screen.getByText('Principal ↔ Cortex')).toBeTruthy()
  })

  it('does not crash when both conversationContext and chatApi are undefined', () => {
    render(<ChatPanel />)
    expect(screen.getByText('Chat API not connected. Start the web backend with `pnpm dev:web`.')).toBeTruthy()
  })

  // Tier 2 — Message binding
  it('ChatMessage type includes optional traceId field', () => {
    // Type-level verification — if this compiles, the traceId field exists
    const msg: ChatMessage = {
      role: 'assistant',
      content: 'test',
      timestamp: new Date().toISOString(),
      traceId: 'trace-123',
    }
    expect(msg.traceId).toBe('trace-123')
  })

  it('ChatMessage type allows omitting traceId (optional field)', () => {
    const msg: ChatMessage = {
      role: 'user',
      content: 'test',
      timestamp: new Date().toISOString(),
    }
    expect(msg.traceId).toBeUndefined()
  })
})
