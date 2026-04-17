// @vitest-environment jsdom

import React from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { ChatPanel } from '../ChatPanel'
import type { ChatAPI } from '../ChatPanel'

beforeAll(() => {
  // jsdom does not implement scrollIntoView
  Element.prototype.scrollIntoView = () => {}
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function makeChatApi(send: (m: string) => Promise<{ response: string; traceId: string }>): ChatAPI {
  return {
    send: send as ChatAPI['send'],
    getHistory: vi.fn().mockResolvedValue([]),
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function getTextarea(): HTMLTextAreaElement {
  return screen.getByPlaceholderText(/What can I help you with/i) as HTMLTextAreaElement
}

function getSendButton(): HTMLButtonElement {
  return screen.getByTitle(/Send message/i) as HTMLButtonElement
}

async function submitMessage(value: string) {
  const ta = getTextarea()
  await act(async () => {
    fireEvent.change(ta, { target: { value } })
  })
  await act(async () => {
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: false })
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatPanel — RC-3 queue-while-thinking', () => {
  // T1 — Tier 2 behavior
  it('keeps textarea interactive during sending', async () => {
    const inFlight = createDeferred<{ response: string; traceId: string }>()
    const api = makeChatApi(() => inFlight.promise)

    render(<ChatPanel chatApi={api} />)
    await flush()

    await submitMessage('first message')
    await flush()

    const ta = getTextarea()
    // Post-RC-3: textarea is NOT disabled while a turn is in flight.
    expect(ta.hasAttribute('disabled')).toBe(false)
  })

  // T2 — Tier 2 behavior
  it('keeps Send button interactive during sending with non-empty input', async () => {
    const inFlight = createDeferred<{ response: string; traceId: string }>()
    const api = makeChatApi(() => inFlight.promise)

    render(<ChatPanel chatApi={api} />)
    await flush()

    await submitMessage('first message')
    await flush()

    // Type a new message while the first is in flight.
    const ta = getTextarea()
    await act(async () => {
      fireEvent.change(ta, { target: { value: 'second message' } })
    })

    const btn = getSendButton()
    // Send button is enabled because input is non-empty + canSend is true.
    expect(btn.hasAttribute('disabled')).toBe(false)
  })

  // T3 — Tier 2 behavior
  it('renders queued marker on enqueued message', async () => {
    const inFlight = createDeferred<{ response: string; traceId: string }>()
    const api = makeChatApi(() => inFlight.promise)

    render(<ChatPanel chatApi={api} />)
    await flush()

    // First message — drains immediately (sending: false → true).
    await submitMessage('first')
    await flush()

    // Second message — queued (sending: true at submit time).
    await submitMessage('second')
    await flush()

    // The second user message is in the DOM.
    expect(screen.getByText('first')).toBeTruthy()
    // The queued message bubble carries data-queued="true".
    const queued = document.querySelector('[data-queued="true"]')
    expect(queued).not.toBeNull()
    expect(queued?.textContent).toContain('second')
  })

  // T4 — Tier 2 behavior — FIFO drain
  it('drains queue in FIFO order after each turn completes', async () => {
    const deferreds = [
      createDeferred<{ response: string; traceId: string }>(),
      createDeferred<{ response: string; traceId: string }>(),
      createDeferred<{ response: string; traceId: string }>(),
    ]
    let callIndex = 0
    const sendSpy = vi.fn((_msg: string) => {
      const d = deferreds[callIndex]
      callIndex += 1
      return d.promise
    })
    const api = makeChatApi(sendSpy)

    render(<ChatPanel chatApi={api} />)
    await flush()

    // Submit three messages in succession.
    await submitMessage('m1')
    await flush()
    await submitMessage('m2')
    await flush()
    await submitMessage('m3')
    await flush()

    // Only the first call should be made so far; m2 and m3 are queued.
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0]).toBe('m1')

    // Resolve the first; drain should pop m2.
    // Empty traceId avoids ThoughtSummary tRPC dependency in this unit test.
    await act(async () => {
      deferreds[0].resolve({ response: 'r1', traceId: '' })
    })
    await flush()
    expect(sendSpy).toHaveBeenCalledTimes(2)
    expect(sendSpy.mock.calls[1][0]).toBe('m2')

    // Resolve the second; drain should pop m3.
    await act(async () => {
      deferreds[1].resolve({ response: 'r2', traceId: '' })
    })
    await flush()
    expect(sendSpy).toHaveBeenCalledTimes(3)
    expect(sendSpy.mock.calls[2][0]).toBe('m3')

    // Resolve the third; queue should be empty.
    await act(async () => {
      deferreds[2].resolve({ response: 'r3', traceId: '' })
    })
    await flush()
    expect(sendSpy).toHaveBeenCalledTimes(3)
  })

  // T5 — Tier 2 behavior — no double-submit
  it('does not double-submit when a second send fires mid-flight', async () => {
    const inFlight = createDeferred<{ response: string; traceId: string }>()
    const sendSpy = vi.fn((_msg: string) => inFlight.promise)
    const api = makeChatApi(sendSpy)

    render(<ChatPanel chatApi={api} />)
    await flush()

    await submitMessage('first')
    await flush()
    await submitMessage('second')
    await flush()

    // chatApi.send is called exactly once; the second message is queued.
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0]).toBe('first')

    // Second message present in DOM with queued marker.
    const queued = document.querySelector('[data-queued="true"]')
    expect(queued).not.toBeNull()
    expect(queued?.textContent).toContain('second')
  })

  // T6 — Tier 3 invariant — queued flag clears at drain
  it('clears queued flag on drain', async () => {
    const first = createDeferred<{ response: string; traceId: string }>()
    const second = createDeferred<{ response: string; traceId: string }>()
    let i = 0
    const deferreds = [first, second]
    const api = makeChatApi(() => deferreds[i++].promise)

    render(<ChatPanel chatApi={api} />)
    await flush()

    await submitMessage('first')
    await flush()
    await submitMessage('second')
    await flush()

    // Sanity: second is queued.
    expect(document.querySelector('[data-queued="true"]')).not.toBeNull()

    // Resolve first turn; drain should clear queued flag on 'second'.
    // Empty traceId avoids ThoughtSummary tRPC dependency in this unit test.
    await act(async () => {
      first.resolve({ response: 'r1', traceId: '' })
    })
    await flush()

    // After drain, the queued attribute should no longer be present.
    expect(document.querySelector('[data-queued="true"]')).toBeNull()
  })

  // T7 — Tier 3 regression guard — useAgentActivity untouched
  it('preserves useAgentActivity activity-indicator unchanged (mount + unmount no-throw)', async () => {
    // This is a low-risk regression guard: render + unmount the panel and
    // ensure no exception is thrown. The useAgentActivity subscription is
    // wired at render time; if RC-3 inadvertently broke its subscription,
    // we'd see an effect-cleanup throw or a render throw here.
    const api = makeChatApi(() => new Promise(() => {}))
    const { unmount } = render(<ChatPanel chatApi={api} />)
    await flush()
    expect(() => unmount()).not.toThrow()
  })
})
