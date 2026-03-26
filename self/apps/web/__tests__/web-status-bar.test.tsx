// @vitest-environment jsdom

import * as React from 'react'
import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { WebStatusBar } from '@/components/shell/web-status-bar'

describe('WebStatusBar', () => {
  afterEach(() => { cleanup() })
  it('renders mode label matching provided mode "simple"', () => {
    render(<WebStatusBar mode="simple" />)
    expect(screen.getByTestId('web-status-bar-mode').textContent).toBe('Simple')
  })

  it('renders mode label matching provided mode "developer"', () => {
    render(<WebStatusBar mode="developer" />)
    expect(screen.getByTestId('web-status-bar-mode').textContent).toBe('Developer')
  })

  it('renders "Connected" status indicator', () => {
    render(<WebStatusBar mode="simple" />)
    expect(screen.getByTestId('web-status-bar-status').textContent).toBe('Connected')
  })

  it('renders with default mode when prop omitted', () => {
    render(<WebStatusBar />)
    expect(screen.getByTestId('web-status-bar-mode').textContent).toBe('Simple')
  })
})
