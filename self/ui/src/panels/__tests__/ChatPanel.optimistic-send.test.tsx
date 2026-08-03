// @vitest-environment jsdom
//
// SP 1.9 Plan Task #19 — Axis C cases 2 + 3 for the ChatPanel
// optimistic-send + error-overlay rendering. Mocks `trpc.chat.getHistory.
// useQuery` to return a static (and mutable) `data` so a useQuery-migration
// regression cannot leak into an Axis-C failure (per SDS § 0 Note 6
// disjointness contract). The overlay reducer logic is what's exercised.

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import {
  makeTrpcMock,
  setMockHistoryEntries,
  setMockHistoryFromChatMessages,
} from './chat-panel-trpc-mock'

vi.mock('@nous/transport', () => makeTrpcMock())

import { ChatPanel } from '../ChatPanel'
import type { ChatAPI } from '../ChatPanel'

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})

let consoleWarnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  setMockHistoryEntries([])
  vi.clearAllMocks()
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  consoleWarnSpy.mockRestore()
})

function makeApi(send: ChatAPI['send']): ChatAPI {
  return {
    send,
    getHistory: async () => [],
    sendAction: vi.fn(),
  }
}

function getTextarea(): HTMLTextAreaElement {
  return screen.getByPlaceholderText(/What can I help you with/i) as HTMLTextAreaElement
}

function getSendButton(): HTMLButtonElement {
  return screen.getByTitle(/Send message/i) as HTMLButtonElement
}

describe('SP 1.9 — ChatPanel optimistic-send overlay (Axis C case 2)', () => {
  it('renders the successful send response from the direct payload before history refetch', async () => {
    const send = vi.fn().mockResolvedValue({
      response: 'direct assistant reply',
      traceId: 'tr-direct',
      thinking_unavailable: {
        reason: 'provider/model template does not surface thinking',
        ref: 'WR-172',
      },
    })
    const api = makeApi(send)

    render(<ChatPanel chatApi={api} projectId="p1" />)

    fireEvent.change(getTextarea(), { target: { value: 'hello' } })
    fireEvent.click(getSendButton())

    await waitFor(() => {
      expect(screen.getByText('direct assistant reply')).toBeTruthy()
    })
    expect(screen.getByText(/Thinking unavailable on this turn/)).toBeTruthy()
    expect(screen.getByText(/WR-172/)).toBeTruthy()
  })

  it('renders a visible diagnostic for a successful empty direct response', async () => {
    const send = vi.fn().mockResolvedValue({
      response: '',
      traceId: 'tr-empty-direct',
    })
    const api = makeApi(send)

    render(<ChatPanel chatApi={api} projectId="p1" />)

    fireEvent.change(getTextarea(), { target: { value: 'hello' } })
    fireEvent.click(getSendButton())

    await waitFor(() => {
      expect(screen.getByTestId('assistant-empty-response-diagnostic').textContent)
        .toContain('No assistant content was returned for this turn.')
    })
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[ChatPanelRenderer] send-started',
      expect.objectContaining({
        sendSequence: 1,
        stage: 'full',
        skipUserAppend: false,
        hasAnsweredOverlayKey: false,
        hasProjectId: true,
      }),
    )
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[ChatPanelRenderer] assistant-overlay-appended',
      expect.objectContaining({
        sendSequence: 1,
        traceId: 'tr-empty-direct',
        contentLength: 0,
        hasThinkingContent: false,
        hasThinkingUnavailable: false,
        emptyResponseKind: null,
        hasStructuredCards: false,
      }),
    )
  })

  it('case 2: optimistic user-entry renders immediately on send; dedup against server echo', async () => {
    const send = vi.fn().mockResolvedValue({ response: 'reply', traceId: 'tr-1' })
    const api = makeApi(send)

    const { rerender } = render(<ChatPanel chatApi={api} projectId="p1" />)

    fireEvent.change(getTextarea(), { target: { value: 'hello' } })
    fireEvent.click(getSendButton())

    // Optimistic user entry renders immediately (before server echo).
    await waitFor(() => {
      expect(screen.getByText('hello')).toBeTruthy()
    })

    // Simulate server echoing the user entry back via useQuery refetch
    // (driven by the useChatApi.send invalidate). The overlay's prune
    // useEffect should drop the optimistic entry on next render so we end
    // up with exactly one user-content match.
    setMockHistoryFromChatMessages([
      { role: 'user', content: 'hello', timestamp: new Date().toISOString() },
      { role: 'assistant', content: 'reply', timestamp: new Date().toISOString(), traceId: 'tr-1' },
    ])
    rerender(<ChatPanel chatApi={api} projectId="p1" />)

    await waitFor(() => {
      const matches = screen.getAllByText('hello')
      expect(matches.length).toBe(1)
    })
  })
})

describe('SP 1.9 — ChatPanel error overlay on send failure (Axis C case 3)', () => {
  it('case 3: send throws — error assistant entry surfaces in overlay', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network down'))
    const api = makeApi(send)

    render(<ChatPanel chatApi={api} projectId="p1" />)

    fireEvent.change(getTextarea(), { target: { value: 'ping' } })
    fireEvent.click(getSendButton())

    await waitFor(() => {
      expect(screen.getByText('Error: could not reach Nous.')).toBeTruthy()
    })
    // Optimistic user entry also rendered.
    expect(screen.getByText('ping')).toBeTruthy()
  })
})
