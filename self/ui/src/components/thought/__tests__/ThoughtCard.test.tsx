// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ThoughtCard } from '../ThoughtCard'
import type { ThoughtPfcDecisionPayload } from '@nous/shared'

function makePayload(
  overrides?: Partial<ThoughtPfcDecisionPayload>,
): ThoughtPfcDecisionPayload {
  return {
    traceId: 'trace-1',
    thoughtType: 'confidence-governance',
    decision: 'approved',
    reason: 'high confidence',
    content: 'patternId=chat-response outcome=approved tier=3',
    sequence: 1,
    emittedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('ThoughtCard', () => {
  it('renders thoughtType, decision, content from payload', () => {
    render(<ThoughtCard payload={makePayload()} compact={false} />)

    expect(screen.getByText('[confidence-governance]')).toBeTruthy()
    // text-transform: uppercase is CSS-only; jsdom sees lowercase
    expect(screen.getByText('approved')).toBeTruthy()
    expect(
      screen.getByText('patternId=chat-response outcome=approved tier=3'),
    ).toBeTruthy()
  })

  it('renders reason when not compact', () => {
    render(
      <ThoughtCard payload={makePayload({ reason: 'high confidence' })} compact={false} />,
    )
    expect(screen.getByText('high confidence')).toBeTruthy()
  })

  it('hides reason when compact', () => {
    render(
      <ThoughtCard payload={makePayload({ reason: 'high confidence' })} compact={true} />,
    )
    // reason should not be rendered in compact mode
    expect(screen.queryByText('high confidence')).toBeNull()
  })

  it('applies approved left border color', () => {
    render(<ThoughtCard payload={makePayload({ decision: 'approved' })} compact={false} />)
    const el = screen.getByTestId('thought-event')
    expect(el.style.borderLeft).toContain('var(--nous-state-approved)')
  })

  it('applies denied left border color', () => {
    render(<ThoughtCard payload={makePayload({ decision: 'denied' })} compact={false} />)
    const el = screen.getByTestId('thought-event')
    expect(el.style.borderLeft).toContain('var(--nous-alert-error)')
  })

  it('applies neutral left border color', () => {
    render(<ThoughtCard payload={makePayload({ decision: 'neutral' })} compact={false} />)
    const el = screen.getByTestId('thought-event')
    expect(el.style.borderLeft).toContain('var(--nous-fg-subtle)')
  })

  it('has role="status" attribute', () => {
    render(<ThoughtCard payload={makePayload()} compact={false} />)
    const el = screen.getByTestId('thought-event')
    expect(el.getAttribute('role')).toBe('status')
  })

  it('has composed aria-label containing decision type and content', () => {
    render(
      <ThoughtCard
        payload={makePayload({
          decision: 'approved',
          thoughtType: 'memory-write',
          content: 'wrote key=xyz',
        })}
        compact={false}
      />,
    )
    const el = screen.getByTestId('thought-event')
    const label = el.getAttribute('aria-label')!
    expect(label).toContain('approved')
    expect(label).toContain('memory-write')
    expect(label).toContain('wrote key=xyz')
  })

  it('has data-testid="thought-event" attribute', () => {
    render(<ThoughtCard payload={makePayload()} compact={false} />)
    expect(screen.getByTestId('thought-event')).toBeTruthy()
  })

  it('applies nous-animate-fade-in-up CSS class', () => {
    render(<ThoughtCard payload={makePayload()} compact={false} />)
    const el = screen.getByTestId('thought-event')
    expect(el.classList.contains('nous-animate-fade-in-up')).toBe(true)
  })

  it('compact mode applies compact padding', () => {
    render(<ThoughtCard payload={makePayload()} compact={true} />)
    const el = screen.getByTestId('thought-event')
    expect(el.style.padding).toContain('var(--nous-space-xs)')
  })

  it('relaxed mode applies full-size padding', () => {
    render(<ThoughtCard payload={makePayload()} compact={false} />)
    const el = screen.getByTestId('thought-event')
    expect(el.style.padding).toContain('var(--nous-space-sm)')
  })
})
