// @vitest-environment jsdom

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActionCard } from '../action-card'
import type { CardRendererProps } from '../../openui-adapter/types'

function makeProps(
  overrides?: Partial<Record<string, unknown>>,
): CardRendererProps<unknown> {
  return {
    props: {
      title: 'Action Required',
      description: 'Please choose an action',
      actions: [
        { label: 'Approve', actionType: 'approve', variant: 'primary' },
        { label: 'Cancel', actionType: 'reject', variant: 'secondary' },
      ],
      ...overrides,
    },
  }
}

describe('ActionCard', () => {
  it('renders title and description', () => {
    render(<ActionCard {...makeProps()} />)
    expect(screen.getByText('Action Required')).toBeTruthy()
    expect(screen.getByText('Please choose an action')).toBeTruthy()
  })

  it('renders action buttons', () => {
    render(<ActionCard {...makeProps()} />)
    expect(screen.getByText('Approve')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it('calls onAction with correct CardAction payload on button click', () => {
    const onAction = vi.fn()
    render(<ActionCard {...makeProps()} onAction={onAction} />)
    fireEvent.click(screen.getByTestId('action-btn-approve'))
    expect(onAction).toHaveBeenCalledTimes(1)
    const action = onAction.mock.calls[0][0]
    expect(action.actionType).toBe('approve')
    expect(action.payload).toEqual({})
  })

  it('emits correct payload for reject action', () => {
    const onAction = vi.fn()
    render(<ActionCard {...makeProps()} onAction={onAction} />)
    fireEvent.click(screen.getByTestId('action-btn-reject'))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction.mock.calls[0][0].actionType).toBe('reject')
  })

  it('emits action with custom payload when provided', () => {
    const onAction = vi.fn()
    const actions = [
      {
        label: 'Go',
        actionType: 'navigate',
        variant: 'primary',
        payload: { target: '/dashboard' },
      },
    ]
    render(<ActionCard props={{ title: 'T', description: 'D', actions }} onAction={onAction} />)
    fireEvent.click(screen.getByTestId('action-btn-navigate'))
    expect(onAction.mock.calls[0][0].payload).toEqual({ target: '/dashboard' })
  })

  it('renders maximum 4 actions correctly', () => {
    const actions = Array.from({ length: 4 }, (_, i) => ({
      label: `Action ${i}`,
      actionType: 'approve' as const,
      variant: 'secondary' as const,
    }))
    render(<ActionCard props={{ title: 'T', description: 'D', actions }} />)
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })

  it('stale with actionOutcome renders outcome badge', () => {
    render(
      <ActionCard
        {...makeProps()}
        stale={true}
        actionOutcome={{ actionType: 'approve', label: 'Approved', timestamp: '2026-01-01' }}
      />,
    )
    expect(screen.getByTestId('action-card-outcome')).toBeTruthy()
    expect(screen.getByText('Approved')).toBeTruthy()
  })

  it('stale without actionOutcome renders disabled "Expired" buttons', () => {
    render(<ActionCard {...makeProps()} stale={true} />)
    const expiredBtns = screen.getAllByTestId('action-card-expired-btn')
    expect(expiredBtns.length).toBeGreaterThan(0)
    for (const btn of expiredBtns) {
      expect(btn).toHaveProperty('disabled', true)
    }
  })

  it('renders invalid props fallback', () => {
    render(<ActionCard props={{}} />)
    expect(screen.getByTestId('action-card-invalid')).toBeTruthy()
    expect(screen.getByText('Invalid action card data')).toBeTruthy()
  })

  it('action with absent optional payload emits valid CardAction', () => {
    const onAction = vi.fn()
    const actions = [{ label: 'Go', actionType: 'approve', variant: 'primary' }]
    render(<ActionCard props={{ title: 'T', description: 'D', actions }} onAction={onAction} />)
    fireEvent.click(screen.getByTestId('action-btn-approve'))
    const cardAction = onAction.mock.calls[0][0]
    expect(cardAction.payload).toEqual({})
    expect(cardAction.actionType).toBe('approve')
  })
})
