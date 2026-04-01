// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusCard } from '../status-card'
import type { CardRendererProps } from '../../openui-adapter/types'

function makeProps(
  overrides?: Partial<Record<string, unknown>>,
): CardRendererProps<unknown> {
  return {
    props: {
      title: 'Test Status',
      status: 'active',
      message: 'Something is happening',
      ...overrides,
    },
  }
}

describe('StatusCard', () => {
  it('renders title and message', () => {
    render(<StatusCard {...makeProps()} />)
    expect(screen.getByText('Test Status')).toBeTruthy()
    expect(screen.getByText('Something is happening')).toBeTruthy()
  })

  it('renders detail when provided', () => {
    render(<StatusCard {...makeProps({ detail: 'Extra info' })} />)
    expect(screen.getByText('Extra info')).toBeTruthy()
  })

  it('applies correct left-border color for active status', () => {
    render(<StatusCard {...makeProps({ status: 'active' })} />)
    const card = screen.getByTestId('status-card')
    expect(card.style.borderLeft).toContain('var(--nous-state-active)')
  })

  it('applies correct left-border color for complete status', () => {
    render(<StatusCard {...makeProps({ status: 'complete' })} />)
    const card = screen.getByTestId('status-card')
    expect(card.style.borderLeft).toContain('var(--nous-state-complete)')
  })

  it('applies correct left-border color for error status', () => {
    render(<StatusCard {...makeProps({ status: 'error' })} />)
    const card = screen.getByTestId('status-card')
    expect(card.style.borderLeft).toContain('var(--nous-state-blocked)')
  })

  it('applies correct left-border color for waiting status', () => {
    render(<StatusCard {...makeProps({ status: 'waiting' })} />)
    const card = screen.getByTestId('status-card')
    expect(card.style.borderLeft).toContain('var(--nous-state-waiting)')
  })

  it('renders progress bar when progress prop is provided', () => {
    render(<StatusCard {...makeProps({ progress: 60 })} />)
    expect(screen.getByTestId('status-card-progress')).toBeTruthy()
  })

  it('does not render progress bar when progress is absent', () => {
    render(<StatusCard {...makeProps()} />)
    expect(screen.queryByTestId('status-card-progress')).toBeNull()
  })

  it('renders invalid props fallback', () => {
    render(<StatusCard props={{}} />)
    expect(screen.getByTestId('status-card-invalid')).toBeTruthy()
    expect(screen.getByText('Invalid status card data')).toBeTruthy()
  })

  it('stale variant applies muted border', () => {
    render(<StatusCard {...makeProps()} stale={true} />)
    const card = screen.getByTestId('status-card')
    expect(card.style.borderLeft).toContain('var(--nous-fg-muted)')
  })

  it('stale variant applies surface background', () => {
    render(<StatusCard {...makeProps()} stale={true} />)
    const card = screen.getByTestId('status-card')
    expect(card.style.background).toContain('var(--nous-bg-surface)')
  })

  it('has data-testid="status-card"', () => {
    render(<StatusCard {...makeProps()} />)
    expect(screen.getByTestId('status-card')).toBeTruthy()
  })
})
