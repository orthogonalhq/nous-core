// @vitest-environment jsdom

import * as React from 'react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// Mock next/dynamic — returns a component that renders the mock WebMenuBar
vi.mock('next/dynamic', () => ({
  default: (_loader: () => Promise<any>, _options?: any) => {
    return function DynamicWebMenuBar(props: any) {
      return React.createElement('div', { 'data-testid': 'web-menu-bar' },
        React.createElement('button', { 'data-testid': 'menu-trigger' }, 'File'),
        React.createElement('button', { 'data-testid': 'menu-trigger' }, 'View'),
        React.createElement('button', { 'data-testid': 'menu-trigger' }, 'Help'),
      )
    }
  },
}))

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

  it('renders the menu bar with File/View/Help triggers', () => {
    render(<WebHeader mode="simple" onModeToggle={() => {}} />)
    const triggers = screen.getAllByTestId('menu-trigger')
    expect(triggers.length).toBe(3)
    expect(triggers[0].textContent).toBe('File')
    expect(triggers[1].textContent).toBe('View')
    expect(triggers[2].textContent).toBe('Help')
  })

  it('does not render mode badge or toggle buttons', () => {
    render(<WebHeader mode="simple" onModeToggle={() => {}} />)
    expect(screen.queryByTestId('web-header-mode-badge')).toBeNull()
    expect(screen.queryByTestId('web-header-mode-toggle')).toBeNull()
    expect(screen.queryByTestId('web-header-theme-toggle')).toBeNull()
  })
})
