// @vitest-environment jsdom

import * as React from 'react'
import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { WebStatusBar } from '@/components/shell/web-status-bar'

describe('WebStatusBar', () => {
  afterEach(() => { cleanup() })

  it('renders ready indicator', () => {
    render(<WebStatusBar mode="simple" />)
    expect(screen.getByTestId('web-status-bar-indicator').textContent).toContain('ready')
  })

  it('renders workflow count', () => {
    render(<WebStatusBar mode="simple" />)
    expect(screen.getByTestId('web-status-bar-workflows').textContent).toBe('0 workflows')
  })

  it('shows Developer badge in developer mode', () => {
    render(<WebStatusBar mode="developer" />)
    expect(screen.getByTestId('web-status-bar-mode-badge').textContent).toBe('Developer')
  })

  it('hides Developer badge in simple mode', () => {
    render(<WebStatusBar mode="simple" />)
    expect(screen.queryByTestId('web-status-bar-mode-badge')).toBeNull()
  })

  it('renders with default mode (simple) when prop omitted', () => {
    render(<WebStatusBar />)
    expect(screen.queryByTestId('web-status-bar-mode-badge')).toBeNull()
    expect(screen.getByTestId('web-status-bar-indicator')).toBeDefined()
  })
})
