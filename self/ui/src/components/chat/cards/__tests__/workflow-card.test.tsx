// @vitest-environment jsdom

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkflowCard } from '../workflow-card'
import type { CardRendererProps } from '../../openui-adapter/types'

function makeProps(
  overrides?: Partial<Record<string, unknown>>,
): CardRendererProps<unknown> {
  return {
    props: {
      title: 'Data Pipeline',
      workflowId: 'wf-123',
      status: 'running',
      nodeCount: 5,
      summary: 'Processing data from input sources',
      ...overrides,
    },
  }
}

describe('WorkflowCard', () => {
  it('renders title', () => {
    render(<WorkflowCard {...makeProps()} />)
    expect(screen.getByText('Data Pipeline')).toBeTruthy()
  })

  it('renders status indicator dot with correct color for running', () => {
    render(<WorkflowCard {...makeProps({ status: 'running' })} />)
    const dot = screen.getByTestId('workflow-status-dot')
    expect(dot.style.background).toContain('var(--nous-state-active)')
  })

  it('renders status indicator dot with correct color for completed', () => {
    render(<WorkflowCard {...makeProps({ status: 'completed' })} />)
    const dot = screen.getByTestId('workflow-status-dot')
    expect(dot.style.background).toContain('var(--nous-state-complete)')
  })

  it('renders status indicator dot with correct color for failed', () => {
    render(<WorkflowCard {...makeProps({ status: 'failed' })} />)
    const dot = screen.getByTestId('workflow-status-dot')
    expect(dot.style.background).toContain('var(--nous-state-blocked)')
  })

  it('renders status indicator dot with correct color for draft', () => {
    render(<WorkflowCard {...makeProps({ status: 'draft' })} />)
    const dot = screen.getByTestId('workflow-status-dot')
    expect(dot.style.background).toContain('var(--nous-state-idle)')
  })

  it('renders status indicator dot with correct color for ready', () => {
    render(<WorkflowCard {...makeProps({ status: 'ready' })} />)
    const dot = screen.getByTestId('workflow-status-dot')
    expect(dot.style.background).toContain('var(--nous-state-waiting)')
  })

  it('renders node count badge when nodeCount is provided', () => {
    render(<WorkflowCard {...makeProps({ nodeCount: 8 })} />)
    expect(screen.getByTestId('workflow-node-count')).toBeTruthy()
    expect(screen.getByText('8 nodes')).toBeTruthy()
  })

  it('does not render node count badge when nodeCount is absent', () => {
    render(<WorkflowCard {...makeProps({ nodeCount: undefined })} />)
    expect(screen.queryByTestId('workflow-node-count')).toBeNull()
  })

  it('renders summary text when provided', () => {
    render(<WorkflowCard {...makeProps()} />)
    expect(screen.getByTestId('workflow-summary')).toBeTruthy()
    expect(screen.getByText('Processing data from input sources')).toBeTruthy()
  })

  it('does not render summary when absent', () => {
    render(<WorkflowCard {...makeProps({ summary: undefined })} />)
    expect(screen.queryByTestId('workflow-summary')).toBeNull()
  })

  it('Run button emits correct CardAction payload', () => {
    const onAction = vi.fn()
    render(<WorkflowCard {...makeProps()} onAction={onAction} />)
    fireEvent.click(screen.getByTestId('workflow-btn-run'))
    const action = onAction.mock.calls[0][0]
    expect(action.actionType).toBe('submit')
    expect(action.payload.workflowId).toBe('wf-123')
    expect(action.payload.action).toBe('run')
  })

  it('Edit button emits correct CardAction payload', () => {
    const onAction = vi.fn()
    render(<WorkflowCard {...makeProps()} onAction={onAction} />)
    fireEvent.click(screen.getByTestId('workflow-btn-edit'))
    const action = onAction.mock.calls[0][0]
    expect(action.actionType).toBe('navigate')
    expect(action.payload.action).toBe('edit')
  })

  it('Inspect button emits correct CardAction payload', () => {
    const onAction = vi.fn()
    render(<WorkflowCard {...makeProps()} onAction={onAction} />)
    fireEvent.click(screen.getByTestId('workflow-btn-inspect'))
    const action = onAction.mock.calls[0][0]
    expect(action.actionType).toBe('navigate')
    expect(action.payload.action).toBe('inspect')
  })

  it('stale with actionOutcome renders outcome badge', () => {
    render(
      <WorkflowCard
        {...makeProps()}
        stale={true}
        actionOutcome={{ actionType: 'submit', label: 'Executed', timestamp: '2026-01-01' }}
      />,
    )
    expect(screen.getByTestId('workflow-card-outcome')).toBeTruthy()
    expect(screen.getByText('Executed')).toBeTruthy()
  })

  it('stale without actionOutcome renders disabled "Expired" buttons', () => {
    render(<WorkflowCard {...makeProps()} stale={true} />)
    const expiredBtns = screen.getAllByText('Expired')
    expect(expiredBtns.length).toBe(3)
  })

  it('stale variant applies muted status dot', () => {
    render(<WorkflowCard {...makeProps()} stale={true} />)
    const dot = screen.getByTestId('workflow-status-dot')
    expect(dot.style.background).toContain('var(--nous-fg-muted)')
  })

  it('renders invalid props fallback', () => {
    render(<WorkflowCard props={{}} />)
    expect(screen.getByTestId('workflow-card-invalid')).toBeTruthy()
    expect(screen.getByText('Invalid workflow card data')).toBeTruthy()
  })
})
