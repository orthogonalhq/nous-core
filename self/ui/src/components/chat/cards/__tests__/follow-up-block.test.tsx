// @vitest-environment jsdom

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FollowUpBlock } from '../follow-up-block'
import type { CardRendererProps } from '../../openui-adapter/types'

function makeProps(
  overrides?: Partial<Record<string, unknown>>,
): CardRendererProps<unknown> {
  return {
    props: {
      suggestions: [
        { label: 'Tell me more', prompt: 'Explain in detail' },
        { label: 'Show code', prompt: 'Show the code example' },
      ],
      ...overrides,
    },
  }
}

describe('FollowUpBlock', () => {
  it('renders pill buttons in a flex container', () => {
    render(<FollowUpBlock {...makeProps()} />)
    const container = screen.getByTestId('followup-block')
    expect(container).toBeTruthy()
    // Pills should be inside the block
    const pills = screen.getAllByTestId('followup-pill')
    expect(pills.length).toBeGreaterThan(0)
  })

  it('renders correct number of pills', () => {
    render(<FollowUpBlock {...makeProps()} />)
    const pills = screen.getAllByTestId('followup-pill')
    expect(pills).toHaveLength(2)
  })

  it('does NOT render inside a Card container', () => {
    const { container } = render(<FollowUpBlock {...makeProps()} />)
    // Card container has border with --nous-shell-column-border — FollowUpBlock should not
    const outerDiv = container.firstElementChild as HTMLElement
    expect(outerDiv?.style.border ?? '').not.toContain('--nous-shell-column-border')
    expect(outerDiv?.tagName).toBe('DIV')
    expect(outerDiv?.getAttribute('data-testid')).toBe('followup-block')
  })

  it('each pill click calls onAction with correct payload', () => {
    const onAction = vi.fn()
    render(<FollowUpBlock {...makeProps()} onAction={onAction} />)
    const pills = screen.getAllByTestId('followup-pill')
    fireEvent.click(pills[0])
    expect(onAction).toHaveBeenCalledTimes(1)
    const action = onAction.mock.calls[0][0]
    expect(action.actionType).toBe('followup')
    expect(action.payload.prompt).toBe('Explain in detail')
  })

  it('pill uses label as fallback when prompt is absent', () => {
    const onAction = vi.fn()
    const suggestions = [{ label: 'Quick help' }]
    render(
      <FollowUpBlock props={{ suggestions }} onAction={onAction} />,
    )
    fireEvent.click(screen.getByTestId('followup-pill'))
    expect(onAction.mock.calls[0][0].payload.prompt).toBe('Quick help')
  })

  it('renders maximum 6 suggestions correctly', () => {
    const suggestions = Array.from({ length: 6 }, (_, i) => ({
      label: `Suggestion ${i + 1}`,
    }))
    render(<FollowUpBlock props={{ suggestions }} />)
    const pills = screen.getAllByTestId('followup-pill')
    expect(pills).toHaveLength(6)
  })

  it('stale variant renders Badge components instead of buttons', () => {
    render(<FollowUpBlock {...makeProps()} stale={true} />)
    const stalePills = screen.getAllByTestId('followup-stale-pill')
    expect(stalePills).toHaveLength(2)
    // Should not have interactive pills
    expect(screen.queryAllByTestId('followup-pill')).toHaveLength(0)
  })

  it('stale pills are non-interactive (no click handler fires onAction)', () => {
    const onAction = vi.fn()
    render(<FollowUpBlock {...makeProps()} stale={true} onAction={onAction} />)
    const stalePills = screen.getAllByTestId('followup-stale-pill')
    fireEvent.click(stalePills[0])
    expect(onAction).not.toHaveBeenCalled()
  })

  it('renders invalid props fallback', () => {
    render(<FollowUpBlock props={{}} />)
    expect(screen.getByTestId('followup-block-invalid')).toBeTruthy()
    expect(screen.getByText('Invalid follow-up block data')).toBeTruthy()
  })

  it('renders invalid fallback for empty suggestions array', () => {
    render(<FollowUpBlock props={{ suggestions: [] }} />)
    expect(screen.getByTestId('followup-block-invalid')).toBeTruthy()
  })

  it('pill actionType defaults to followup when not specified', () => {
    const onAction = vi.fn()
    const suggestions = [{ label: 'Test' }]
    render(<FollowUpBlock props={{ suggestions }} onAction={onAction} />)
    fireEvent.click(screen.getByTestId('followup-pill'))
    expect(onAction.mock.calls[0][0].actionType).toBe('followup')
  })

  it('respects custom actionType from suggestion', () => {
    const onAction = vi.fn()
    const suggestions = [{ label: 'Go', actionType: 'navigate' }]
    render(<FollowUpBlock props={{ suggestions }} onAction={onAction} />)
    fireEvent.click(screen.getByTestId('followup-pill'))
    expect(onAction.mock.calls[0][0].actionType).toBe('navigate')
  })
})
