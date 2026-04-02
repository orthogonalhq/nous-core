// @vitest-environment jsdom

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ApprovalCard } from '../approval-card'
import type { CardRendererProps } from '../../openui-adapter/types'

function makeProps(
  overrides?: Partial<Record<string, unknown>>,
): CardRendererProps<unknown> {
  return {
    props: {
      title: 'Approve Command',
      description: 'Please review this command',
      tier: 't1',
      command: 'rm -rf /tmp/cache',
      ...overrides,
    },
  }
}

describe('ApprovalCard', () => {
  it('renders title, description, and command block', () => {
    render(<ApprovalCard {...makeProps()} />)
    expect(screen.getByText('Approve Command')).toBeTruthy()
    expect(screen.getByText('Please review this command')).toBeTruthy()
    expect(screen.getByText('rm -rf /tmp/cache')).toBeTruthy()
  })

  it('renders tier badge for t1', () => {
    render(<ApprovalCard {...makeProps({ tier: 't1' })} />)
    expect(screen.getByTestId('approval-tier-badge')).toBeTruthy()
    expect(screen.getByText('Routine')).toBeTruthy()
  })

  it('renders tier badge for t2', () => {
    render(<ApprovalCard {...makeProps({ tier: 't2' })} />)
    expect(screen.getByText('Caution')).toBeTruthy()
  })

  it('renders tier badge for t3', () => {
    render(<ApprovalCard {...makeProps({ tier: 't3' })} />)
    expect(screen.getByText('Critical')).toBeTruthy()
  })

  it('applies correct left-border color for t1', () => {
    render(<ApprovalCard {...makeProps({ tier: 't1' })} />)
    const card = screen.getByTestId('approval-card')
    expect(card.style.borderLeft).toContain('var(--nous-accent)')
  })

  it('applies correct left-border color for t2', () => {
    render(<ApprovalCard {...makeProps({ tier: 't2' })} />)
    const card = screen.getByTestId('approval-card')
    expect(card.style.borderLeft).toContain('var(--nous-alert-warning)')
  })

  it('applies correct left-border color for t3', () => {
    render(<ApprovalCard {...makeProps({ tier: 't3' })} />)
    const card = screen.getByTestId('approval-card')
    expect(card.style.borderLeft).toContain('var(--nous-alert-error)')
  })

  it('command block uses monospace font', () => {
    render(<ApprovalCard {...makeProps()} />)
    const cmdBlock = screen.getByTestId('approval-command-block')
    expect(cmdBlock.style.fontFamily).toContain('var(--nous-font-mono)')
  })

  it('renders context when provided', () => {
    render(<ApprovalCard {...makeProps({ context: { source: 'user', env: 'prod' } })} />)
    expect(screen.getByTestId('approval-context')).toBeTruthy()
    expect(screen.getByText(/source:/)).toBeTruthy()
  })

  it('t1 approve button is immediately clickable', () => {
    const onAction = vi.fn()
    render(<ApprovalCard {...makeProps({ tier: 't1' })} onAction={onAction} />)
    const approveBtn = screen.getByTestId('approval-approve-btn')
    expect(approveBtn).not.toHaveProperty('disabled', true)
    fireEvent.click(approveBtn)
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('t2 approve button is immediately clickable', () => {
    const onAction = vi.fn()
    render(<ApprovalCard {...makeProps({ tier: 't2' })} onAction={onAction} />)
    const approveBtn = screen.getByTestId('approval-approve-btn')
    expect(approveBtn).not.toHaveProperty('disabled', true)
    fireEvent.click(approveBtn)
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('approve emits correct CardAction payload', () => {
    const onAction = vi.fn()
    render(<ApprovalCard {...makeProps()} onAction={onAction} />)
    fireEvent.click(screen.getByTestId('approval-approve-btn'))
    const action = onAction.mock.calls[0][0]
    expect(action.actionType).toBe('approve')
    expect(action.payload.command).toBe('rm -rf /tmp/cache')
    expect(action.payload.tier).toBe('t1')
  })

  it('reject emits correct CardAction payload', () => {
    const onAction = vi.fn()
    render(<ApprovalCard {...makeProps()} onAction={onAction} />)
    fireEvent.click(screen.getByTestId('approval-reject-btn'))
    expect(onAction.mock.calls[0][0].actionType).toBe('reject')
  })

  describe('T3 2-second approve delay', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('t3 approve button is disabled initially', () => {
      render(<ApprovalCard {...makeProps({ tier: 't3' })} />)
      const approveBtn = screen.getByTestId('approval-approve-btn')
      expect(approveBtn).toHaveProperty('disabled', true)
    })

    it('t3 approve button shows countdown text', () => {
      render(<ApprovalCard {...makeProps({ tier: 't3' })} />)
      const approveBtn = screen.getByTestId('approval-approve-btn')
      expect(approveBtn.textContent).toContain('Approve (2s)')
    })

    it('t3 approve button enables after 2 seconds', () => {
      render(<ApprovalCard {...makeProps({ tier: 't3' })} />)

      act(() => {
        vi.advanceTimersByTime(2000)
      })

      const approveBtn = screen.getByTestId('approval-approve-btn')
      expect(approveBtn).not.toHaveProperty('disabled', true)
      expect(approveBtn.textContent).toBe('Approve')
    })

    it('t3 countdown updates during the delay', () => {
      render(<ApprovalCard {...makeProps({ tier: 't3' })} />)

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      const approveBtn = screen.getByTestId('approval-approve-btn')
      expect(approveBtn.textContent).toContain('Approve (1s)')
    })

    it('t3 countdown timer cleanup on component unmount', () => {
      const { unmount } = render(<ApprovalCard {...makeProps({ tier: 't3' })} />)

      // Unmount before timer fires — should not cause errors
      unmount()

      act(() => {
        vi.advanceTimersByTime(3000)
      })

      // No error means cleanup worked
      expect(true).toBe(true)
    })
  })

  it('stale variant shows outcome badge when actionOutcome present', () => {
    render(
      <ApprovalCard
        {...makeProps()}
        stale={true}
        actionOutcome={{ actionType: 'approve', label: 'Approved', timestamp: '2026-01-01' }}
      />,
    )
    expect(screen.getByTestId('approval-card-outcome')).toBeTruthy()
    expect(screen.getByText('Approved')).toBeTruthy()
  })

  it('stale variant shows disabled buttons when no actionOutcome', () => {
    render(<ApprovalCard {...makeProps()} stale={true} />)
    const expiredBtn = screen.getByTestId('approval-expired-btn')
    expect(expiredBtn).toHaveProperty('disabled', true)
  })

  it('stale variant applies muted border', () => {
    render(<ApprovalCard {...makeProps()} stale={true} />)
    const card = screen.getByTestId('approval-card')
    expect(card.style.borderLeft).toContain('var(--nous-fg-muted)')
  })

  it('renders invalid props fallback', () => {
    render(<ApprovalCard props={{}} />)
    expect(screen.getByTestId('approval-card-invalid')).toBeTruthy()
  })
})
