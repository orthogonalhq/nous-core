// @vitest-environment jsdom

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ThoughtToggle } from '../ThoughtToggle'

describe('ThoughtToggle', () => {
  it('renders with aria-expanded={true} when expanded', () => {
    render(
      <ThoughtToggle expanded={true} eventCount={3} onToggle={() => {}} sending={false} />,
    )
    expect(screen.getByTestId('thought-toggle').getAttribute('aria-expanded')).toBe('true')
  })

  it('renders with aria-expanded={false} when collapsed', () => {
    render(
      <ThoughtToggle expanded={false} eventCount={3} onToggle={() => {}} sending={false} />,
    )
    expect(screen.getByTestId('thought-toggle').getAttribute('aria-expanded')).toBe('false')
  })

  it('has aria-controls="thought-stream" attribute', () => {
    render(
      <ThoughtToggle expanded={false} eventCount={3} onToggle={() => {}} sending={false} />,
    )
    expect(screen.getByTestId('thought-toggle').getAttribute('aria-controls')).toBe('thought-stream')
  })

  it('has aria-label containing event count', () => {
    render(
      <ThoughtToggle expanded={false} eventCount={3} onToggle={() => {}} sending={false} />,
    )
    const label = screen.getByTestId('thought-toggle').getAttribute('aria-label')!
    expect(label).toContain('3 events')
  })

  it('aria-label uses singular "event" for count of 1', () => {
    render(
      <ThoughtToggle expanded={false} eventCount={1} onToggle={() => {}} sending={false} />,
    )
    const label = screen.getByTestId('thought-toggle').getAttribute('aria-label')!
    expect(label).toContain('1 event')
    expect(label).not.toContain('1 events')
  })

  it('displays event count badge text', () => {
    render(
      <ThoughtToggle expanded={false} eventCount={5} onToggle={() => {}} sending={false} />,
    )
    expect(screen.getByText('5 thoughts')).toBeTruthy()
  })

  it('calls onToggle callback when clicked', () => {
    const onToggle = vi.fn()
    render(
      <ThoughtToggle expanded={false} eventCount={3} onToggle={onToggle} sending={false} />,
    )
    fireEvent.click(screen.getByTestId('thought-toggle'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('has data-testid="thought-toggle" attribute', () => {
    render(
      <ThoughtToggle expanded={false} eventCount={3} onToggle={() => {}} sending={false} />,
    )
    expect(screen.getByTestId('thought-toggle')).toBeTruthy()
  })

  it('shows "Thinking..." text when sending is true and collapsed', () => {
    render(
      <ThoughtToggle expanded={false} eventCount={3} onToggle={() => {}} sending={true} />,
    )
    expect(screen.getByText('Thinking...')).toBeTruthy()
  })

  it('hides "Thinking..." text when sending is false', () => {
    render(
      <ThoughtToggle expanded={false} eventCount={3} onToggle={() => {}} sending={false} />,
    )
    expect(screen.queryByText('Thinking...')).toBeNull()
  })

  it('hides "Thinking..." text when sending is true and expanded', () => {
    render(
      <ThoughtToggle expanded={true} eventCount={3} onToggle={() => {}} sending={true} />,
    )
    expect(screen.queryByText('Thinking...')).toBeNull()
  })

  it('expanded chevron has transform rotate(90deg)', () => {
    render(
      <ThoughtToggle expanded={true} eventCount={3} onToggle={() => {}} sending={false} />,
    )
    const chevron = screen.getByTestId('thought-toggle-chevron')
    expect(chevron.style.transform).toBe('rotate(90deg)')
  })

  it('collapsed chevron has transform rotate(0deg)', () => {
    render(
      <ThoughtToggle expanded={false} eventCount={3} onToggle={() => {}} sending={false} />,
    )
    const chevron = screen.getByTestId('thought-toggle-chevron')
    expect(chevron.style.transform).toBe('rotate(0deg)')
  })

  it('chevron has transition property for transform', () => {
    render(
      <ThoughtToggle expanded={false} eventCount={3} onToggle={() => {}} sending={false} />,
    )
    const chevron = screen.getByTestId('thought-toggle-chevron')
    expect(chevron.style.transition).toContain('var(--nous-ambient-fade)')
  })

  it('chevron has nous-thought-transition CSS class', () => {
    render(
      <ThoughtToggle expanded={false} eventCount={3} onToggle={() => {}} sending={false} />,
    )
    const chevron = screen.getByTestId('thought-toggle-chevron')
    expect(chevron.classList.contains('nous-thought-transition')).toBe(true)
  })
})
