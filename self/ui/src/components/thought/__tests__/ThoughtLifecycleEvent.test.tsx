// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ThoughtLifecycleEvent } from '../ThoughtLifecycleEvent'
import type { ThoughtTurnLifecyclePayload } from '@nous/shared'

function makePayload(
  overrides?: Partial<ThoughtTurnLifecyclePayload>,
): ThoughtTurnLifecyclePayload {
  return {
    traceId: 'trace-1',
    phase: 'turn-start',
    status: 'started',
    sequence: 0,
    emittedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('ThoughtLifecycleEvent', () => {
  it('renders phase and status from payload', () => {
    render(<ThoughtLifecycleEvent payload={makePayload({ phase: 'gateway-run', status: 'completed' })} />)
    expect(screen.getByText('[gateway-run]')).toBeTruthy()
    expect(screen.getByText('completed')).toBeTruthy()
  })

  it('renders optional content when present', () => {
    render(
      <ThoughtLifecycleEvent
        payload={makePayload({ content: 'gateway execution finished' })}
      />,
    )
    expect(screen.getByText('gateway execution finished')).toBeTruthy()
  })

  it('falls back to status display when content is absent', () => {
    render(
      <ThoughtLifecycleEvent
        payload={makePayload({ status: 'started', content: undefined })}
      />,
    )
    expect(screen.getByText('started')).toBeTruthy()
  })

  it('has role="status" attribute', () => {
    render(<ThoughtLifecycleEvent payload={makePayload()} />)
    const el = screen.getByTestId('thought-event')
    expect(el.getAttribute('role')).toBe('status')
  })

  it('has composed aria-label containing phase and status', () => {
    render(
      <ThoughtLifecycleEvent
        payload={makePayload({ phase: 'opctl-check', status: 'completed' })}
      />,
    )
    const el = screen.getByTestId('thought-event')
    const label = el.getAttribute('aria-label')!
    expect(label).toContain('opctl-check')
    expect(label).toContain('completed')
  })

  it('has data-testid="thought-event" attribute', () => {
    render(<ThoughtLifecycleEvent payload={makePayload()} />)
    expect(screen.getByTestId('thought-event')).toBeTruthy()
  })

  it('applies nous-animate-fade-in-up CSS class', () => {
    render(<ThoughtLifecycleEvent payload={makePayload()} />)
    const el = screen.getByTestId('thought-event')
    expect(el.classList.contains('nous-animate-fade-in-up')).toBe(true)
  })

  it('uses transparent background', () => {
    render(<ThoughtLifecycleEvent payload={makePayload()} />)
    const el = screen.getByTestId('thought-event')
    expect(el.style.background).toBe('transparent')
  })
})
