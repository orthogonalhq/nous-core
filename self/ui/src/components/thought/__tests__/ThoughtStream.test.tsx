// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, beforeAll } from 'vitest'
import { ThoughtStream } from '../ThoughtStream'
import type { ThoughtEvent } from '../ThoughtStream'
import type { ThoughtPfcDecisionPayload, ThoughtTurnLifecyclePayload } from '@nous/shared'

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})

function makePfcEvent(
  overrides?: Partial<ThoughtPfcDecisionPayload>,
): ThoughtEvent {
  return {
    channel: 'thought:pfc-decision',
    payload: {
      traceId: 'trace-1',
      thoughtType: 'confidence-governance',
      decision: 'approved',
      reason: 'high confidence',
      content: 'patternId=chat-response outcome=approved',
      sequence: 1,
      emittedAt: new Date().toISOString(),
      ...overrides,
    },
  }
}

function makeLifecycleEvent(
  overrides?: Partial<ThoughtTurnLifecyclePayload>,
): ThoughtEvent {
  return {
    channel: 'thought:turn-lifecycle',
    payload: {
      traceId: 'trace-1',
      phase: 'turn-start',
      status: 'started',
      sequence: 0,
      emittedAt: new Date().toISOString(),
      ...overrides,
    },
  }
}

describe('ThoughtStream', () => {
  it('renders role="log" on container', () => {
    render(<ThoughtStream thoughts={[makePfcEvent()]} mode="conversing:expanded" />)
    const el = screen.getByTestId('thought-stream')
    expect(el.getAttribute('role')).toBe('log')
  })

  it('renders aria-live="polite" on container', () => {
    render(<ThoughtStream thoughts={[makePfcEvent()]} mode="conversing:expanded" />)
    const el = screen.getByTestId('thought-stream')
    expect(el.getAttribute('aria-live')).toBe('polite')
  })

  it('renders aria-label="AI thought stream" on container', () => {
    render(<ThoughtStream thoughts={[makePfcEvent()]} mode="conversing:expanded" />)
    const el = screen.getByTestId('thought-stream')
    expect(el.getAttribute('aria-label')).toBe('AI thought stream')
  })

  it('renders id="thought-stream" on container', () => {
    render(<ThoughtStream thoughts={[makePfcEvent()]} mode="conversing:expanded" />)
    const el = screen.getByTestId('thought-stream')
    expect(el.getAttribute('id')).toBe('thought-stream')
  })

  it('has data-testid="thought-stream" attribute', () => {
    render(<ThoughtStream thoughts={[makePfcEvent()]} mode="conversing:expanded" />)
    expect(screen.getByTestId('thought-stream')).toBeTruthy()
  })

  it('renders ThoughtCard for thought:pfc-decision events', () => {
    render(
      <ThoughtStream
        thoughts={[makePfcEvent({ thoughtType: 'memory-write' })]}
        mode="conversing:expanded"
      />,
    )
    expect(screen.getByText('[memory-write]')).toBeTruthy()
  })

  it('renders ThoughtLifecycleEvent for thought:turn-lifecycle events', () => {
    render(
      <ThoughtStream
        thoughts={[makeLifecycleEvent({ phase: 'gateway-run' })]}
        mode="conversing:expanded"
      />,
    )
    expect(screen.getByText('[gateway-run]')).toBeTruthy()
  })

  it('in conversing:expanded mode applies compact layout (200px max height, xs gaps)', () => {
    render(<ThoughtStream thoughts={[makePfcEvent()]} mode="conversing:expanded" />)
    const el = screen.getByTestId('thought-stream')
    expect(el.style.maxHeight).toBe('200px')
    expect(el.style.gap).toContain('var(--nous-space-xs)')
  })

  it('in ambient:open mode applies relaxed layout (no max height, sm gaps)', () => {
    render(<ThoughtStream thoughts={[makePfcEvent()]} mode="ambient:open" />)
    const el = screen.getByTestId('thought-stream')
    expect(el.style.maxHeight).toBe('')
    expect(el.style.gap).toContain('var(--nous-space-sm)')
  })

  it('renders multiple events correctly', () => {
    render(
      <ThoughtStream
        thoughts={[
          makePfcEvent({ content: 'first-event' }),
          makeLifecycleEvent({ phase: 'opctl-check', content: 'second-event' }),
          makePfcEvent({ content: 'third-event', decision: 'denied' }),
        ]}
        mode="conversing:expanded"
      />,
    )
    const events = screen.getAllByTestId('thought-event')
    expect(events.length).toBe(3)
    expect(screen.getByText('first-event')).toBeTruthy()
    expect(screen.getByText('second-event')).toBeTruthy()
    expect(screen.getByText('third-event')).toBeTruthy()
  })
})
