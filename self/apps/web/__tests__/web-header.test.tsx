// @vitest-environment jsdom

import * as React from 'react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { WebHeader } from '@/components/shell/web-header'

describe('WebHeader', () => {
  afterEach(() => { cleanup() })

  it('renders the app icon', () => {
    render(<WebHeader mode="simple" onModeToggle={() => {}} />)
    expect(screen.getByTestId('web-header-app-icon').textContent).toBe('◈')
  })

  it('renders the app name "Nous"', () => {
    render(<WebHeader mode="simple" onModeToggle={() => {}} />)
    expect(screen.getByTestId('web-header-app-name').textContent).toBe('Nous')
  })

  it('renders mode badge with "Simple" text for mode="simple"', () => {
    render(<WebHeader mode="simple" onModeToggle={() => {}} />)
    expect(screen.getByTestId('web-header-mode-badge').textContent).toBe('Simple')
  })

  it('renders mode badge with "Developer" text for mode="developer"', () => {
    render(<WebHeader mode="developer" onModeToggle={() => {}} />)
    expect(screen.getByTestId('web-header-mode-badge').textContent).toBe('Developer')
  })

  it('calls onModeToggle callback on mode toggle button click', () => {
    const onModeToggle = vi.fn()
    render(<WebHeader mode="simple" onModeToggle={onModeToggle} />)
    fireEvent.click(screen.getByTestId('web-header-mode-toggle'))
    expect(onModeToggle).toHaveBeenCalledOnce()
  })

  it('renders theme toggle button', () => {
    render(<WebHeader mode="simple" onModeToggle={() => {}} />)
    expect(screen.getByTestId('web-header-theme-toggle')).toBeDefined()
  })
})
