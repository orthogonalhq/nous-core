// @vitest-environment jsdom

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import {
  makeTrpcMock,
  setMockHistoryFromChatMessages,
  setMockHistoryEntries,
} from './chat-panel-trpc-mock'

vi.mock('@nous/transport', () => makeTrpcMock())

import { ChatPanel } from '../ChatPanel'
import type { ChatAPI, ChatMessage } from '../ChatPanel'
import { ShellProvider } from '../../components/shell/ShellContext'

beforeAll(() => {
  // jsdom does not implement scrollIntoView
  Element.prototype.scrollIntoView = () => {}
})

beforeEach(() => {
  setMockHistoryEntries([])
})

const mockNavigate = vi.fn()

// SP 1.9 Plan Task #14 — see ChatPanel.content-detection.test.tsx for the
// migration-pattern note (history flows through useQuery mock).
function makeChatApi(messages: ChatMessage[], sendAction = vi.fn().mockResolvedValue({ ok: true, message: 'Submitted' })): ChatAPI {
  setMockHistoryFromChatMessages(messages)
  return {
    send: vi.fn().mockResolvedValue({ response: 'ok', traceId: '123' }),
    getHistory: vi.fn().mockResolvedValue(messages),
    sendAction,
  }
}

function renderWithShell(ui: React.ReactElement) {
  return render(
    React.createElement(ShellProvider, { navigate: mockNavigate }, ui),
  )
}

describe('ChatPanel — Action Routing Integration', () => {
  // ---------------------------------------------------------------------------
  // Tier 2: Integration — Action handler wiring
  // ---------------------------------------------------------------------------

  it('non-stale card receives live action buttons', async () => {
    const api = makeChatApi([
      {
        role: 'assistant',
        content: '<ActionCard title="Deploy" description="Ready to deploy" actions=\'[{"label":"Approve","actionType":"approve","payload":{}}]\' />',
        timestamp: '2026-01-01T00:00:00Z',
        contentType: 'openui',
      },
    ])
    renderWithShell(React.createElement(ChatPanel, { chatApi: api }))

    // Wait for card to render
    const container = await screen.findByTestId('openui-card-container')
    expect(container).toBeTruthy()
    // Non-stale card should NOT have data-stale attribute
    expect(container.getAttribute('data-stale')).toBeNull()
  })

  it('stale card (has actionOutcome) renders with stale marker', async () => {
    const api = makeChatApi([
      {
        role: 'assistant',
        content: '<ActionCard title="Deployed" description="Was deployed" actions=\'[{"label":"Approve","actionType":"approve","payload":{}}]\' />',
        timestamp: '2026-01-01T00:00:00Z',
        contentType: 'openui',
        actionOutcome: { actionType: 'approve', label: 'Approved', timestamp: '2026-01-01T00:01:00Z' },
      },
    ])
    renderWithShell(React.createElement(ChatPanel, { chatApi: api }))

    const container = await screen.findByTestId('openui-card-container')
    expect(container.getAttribute('data-stale')).toBe('true')
  })

  it('stale card shows action outcome badge', async () => {
    const api = makeChatApi([
      {
        role: 'assistant',
        content: '<StatusCard title="Done" status="complete" description="Finished" />',
        timestamp: '2026-01-01T00:00:00Z',
        contentType: 'openui',
        actionOutcome: { actionType: 'approve', label: 'Approved', timestamp: '2026-01-01T00:01:00Z' },
      },
    ])
    renderWithShell(React.createElement(ChatPanel, { chatApi: api }))

    const badge = await screen.findByTestId('action-outcome-badge')
    expect(badge).toBeTruthy()
    expect(badge.textContent).toContain('Approved')
  })

  it('only the last assistant message without actionOutcome is non-stale', async () => {
    const api = makeChatApi([
      {
        role: 'assistant',
        content: '<StatusCard title="First" status="active" description="First card" />',
        timestamp: '2026-01-01T00:00:00Z',
        contentType: 'openui',
      },
      {
        role: 'assistant',
        content: '<StatusCard title="Second" status="active" description="Second card" />',
        timestamp: '2026-01-01T00:01:00Z',
        contentType: 'openui',
      },
    ])
    renderWithShell(React.createElement(ChatPanel, { chatApi: api }))

    const containers = await screen.findAllByTestId('openui-card-container')
    expect(containers).toHaveLength(2)
    // First card is stale (not the last assistant message)
    expect(containers[0].getAttribute('data-stale')).toBe('true')
    // Second card is non-stale (is the last assistant message)
    expect(containers[1].getAttribute('data-stale')).toBeNull()
  })
})
