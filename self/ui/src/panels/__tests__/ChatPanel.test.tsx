// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest'
import { makeTrpcMock, setMockHistoryEntries } from './chat-panel-trpc-mock'

vi.mock('@nous/transport', () => makeTrpcMock())

import { ChatPanel } from '../ChatPanel'
import type { ChatAPI, ChatMessage, ChatPanelCoreProps } from '../ChatPanel'

beforeAll(() => {
  // jsdom does not implement scrollIntoView
  Element.prototype.scrollIntoView = () => {}
})

beforeEach(() => {
  setMockHistoryEntries([])
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

  // Tier 2 — Behavior (header removed in WR-116 SP 1.2)
  it('full mode renders without header (no "Principal ↔ Cortex")', () => {
    render(<ChatPanel />)
    expect(screen.queryByText('Principal ↔ Cortex')).toBeNull()
  })

  it('accepts conversationContext prop without crashing', () => {
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
    // Header and badges removed — just verify no crash
    expect(screen.queryByTestId('thread-indicator')).toBeNull()
  })

  it('accepts isAmbient conversationContext without crashing', () => {
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
    // Ambient badge and header removed — just verify no crash
    expect(screen.queryByTestId('ambient-badge')).toBeNull()
  })

  it('full mode shows no header elements regardless of conversationContext', () => {
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
    // Header removed — no ambient text or badge rendered
    expect(screen.queryByTestId('ambient-badge')).toBeNull()
  })

  // Tier 3 — Edge cases
  it('renders with dockview-style { params: { chatApi } } props (existing usage pattern)', () => {
    const mockApi: ChatAPI = {
      send: async () => ({ response: 'test', traceId: '123' }),
      getHistory: async () => [],
    }
    // Cast to any: dockview IDockviewPanelProps also requires api/containerApi which we cannot construct in unit tests
    render(<ChatPanel {...{ params: { chatApi: mockApi } } as any} />)
    // Header removed — just verify it renders the full stage
    expect(screen.getByPlaceholderText(/What can I help you with/i)).toBeTruthy()
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

  // Phase 1.2 — New type fields
  it('ChatMessage type includes optional contentType field', () => {
    const msg: ChatMessage = {
      role: 'assistant',
      content: 'test',
      timestamp: new Date().toISOString(),
      contentType: 'openui',
    }
    expect(msg.contentType).toBe('openui')
  })

  it('ChatMessage type allows omitting contentType (optional field)', () => {
    const msg: ChatMessage = {
      role: 'assistant',
      content: 'test',
      timestamp: new Date().toISOString(),
    }
    expect(msg.contentType).toBeUndefined()
  })

  it('ChatMessage type includes optional actionOutcome field', () => {
    const msg: ChatMessage = {
      role: 'assistant',
      content: 'test',
      timestamp: new Date().toISOString(),
      actionOutcome: { actionType: 'approve', label: 'Approved', timestamp: '2026-01-01T00:00:00Z' },
    }
    expect(msg.actionOutcome?.actionType).toBe('approve')
    expect(msg.actionOutcome?.label).toBe('Approved')
  })

  it('ChatMessage type allows omitting actionOutcome (optional field)', () => {
    const msg: ChatMessage = {
      role: 'assistant',
      content: 'test',
      timestamp: new Date().toISOString(),
    }
    expect(msg.actionOutcome).toBeUndefined()
  })

  it('ChatAPI.send return type includes optional contentType field', () => {
    const api: ChatAPI = {
      send: async () => ({ response: 'ok', traceId: '123', contentType: 'openui' as const }),
      getHistory: async () => [],
    }
    expect(api).toBeDefined()
  })
})
