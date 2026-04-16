// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, beforeAll } from 'vitest'
import { ChatPanel } from '../ChatPanel'
import type { ChatAPI, ChatMessage } from '../ChatPanel'

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})

function makeChatApi(messages: ChatMessage[]): ChatAPI {
  return {
    send: async () => ({ response: 'ok', traceId: '123' }),
    getHistory: async () => messages,
  }
}

describe('ChatPanel — Persistence Round-Trip', () => {
  // ---------------------------------------------------------------------------
  // These tests verify that contentType and actionOutcome survive the
  // STM round-trip (simulated via mocked getHistory return values).
  // ---------------------------------------------------------------------------

  it('getHistory entries with contentType openui: messages render as cards', async () => {
    const api = makeChatApi([
      {
        role: 'assistant',
        content: '<StatusCard title="Persisted" status="active" description="From STM" />',
        timestamp: '2026-01-01T00:00:00Z',
        contentType: 'openui',
      },
    ])
    render(<ChatPanel chatApi={api} />)
    expect(await screen.findByTestId('openui-card-container')).toBeTruthy()
  })

  it('getHistory entries with actionOutcome: messages render with outcome badge', async () => {
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
    expect(await screen.findByTestId('action-outcome-badge')).toBeTruthy()
    // "Approved" text may appear in both the card's own outcome rendering and the badge
    expect(screen.getAllByText('Approved').length).toBeGreaterThanOrEqual(1)
  })

  it('getHistory entries without metadata: messages have contentType undefined (backward compat)', async () => {
    const api = makeChatApi([
      { role: 'assistant', content: 'Legacy message', timestamp: '2026-01-01T00:00:00Z' },
    ])
    render(<ChatPanel chatApi={api} />)
    expect(await screen.findByText('Legacy message')).toBeTruthy()
    expect(screen.queryByTestId('openui-card-container')).toBeNull()
  })

  it('getHistory entries with empty metadata: fields are undefined', async () => {
    // Simulates messages that went through STM with empty metadata
    const api = makeChatApi([
      {
        role: 'assistant',
        content: 'Message with empty metadata',
        timestamp: '2026-01-01T00:00:00Z',
        contentType: undefined,
        actionOutcome: undefined,
      },
    ])
    render(<ChatPanel chatApi={api} />)
    expect(await screen.findByText('Message with empty metadata')).toBeTruthy()
    expect(screen.queryByTestId('openui-card-container')).toBeNull()
  })

  it('actionOutcome round-trip: value preserved through getHistory', async () => {
    const outcome = { actionType: 'reject', label: 'Rejected', timestamp: '2026-01-01T00:05:00Z' }
    const api = makeChatApi([
      {
        role: 'assistant',
        content: '<ApprovalCard title="Request" description="Approve this" tier="standard" />',
        timestamp: '2026-01-01T00:00:00Z',
        contentType: 'openui',
        actionOutcome: outcome,
      },
    ])
    render(<ChatPanel chatApi={api} />)
    expect(await screen.findByText('Rejected')).toBeTruthy()
  })

  it('multiple history entries with mixed contentType: correct rendering for each', async () => {
    const api = makeChatApi([
      { role: 'user', content: 'First question', timestamp: '2026-01-01T00:00:00Z' },
      {
        role: 'assistant',
        content: '<StatusCard title="Card1" status="complete" description="Old" />',
        timestamp: '2026-01-01T00:01:00Z',
        contentType: 'openui',
        actionOutcome: { actionType: 'approve', label: 'Done', timestamp: '2026-01-01T00:02:00Z' },
      },
      { role: 'user', content: 'Second question', timestamp: '2026-01-01T00:03:00Z' },
      { role: 'assistant', content: 'Just text reply', timestamp: '2026-01-01T00:04:00Z', contentType: 'text' },
    ])
    render(<ChatPanel chatApi={api} />)
    // The card message should render as a card (stale + actioned)
    expect(await screen.findByTestId('openui-card-container')).toBeTruthy()
    expect(screen.getByTestId('stale-card')).toBeTruthy()
    // The plain text message should render as text
    expect(screen.getByText('Just text reply')).toBeTruthy()
  })
})
