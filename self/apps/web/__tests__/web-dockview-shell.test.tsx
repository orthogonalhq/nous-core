// @vitest-environment jsdom

import * as React from 'react'
import { afterEach, describe, it, expect, vi } from 'vitest'

// Mock next/dynamic to return a simple placeholder component
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<any>, _options?: any) => {
    function DynamicMock(props: any) {
      return React.createElement('div', { 'data-testid': 'dockview-dynamic-mock' }, 'Dynamic Dockview Shell')
    }
    DynamicMock.displayName = 'DynamicMock'
    return DynamicMock
  },
}))

import { cleanup, render, screen } from '@testing-library/react'
import { WebDockviewShell } from '@/components/shell/web-dockview-shell'

describe('WebDockviewShell', () => {
  afterEach(() => { cleanup() })
  it('is exported as a valid React component', () => {
    expect(typeof WebDockviewShell).toBe('function')
  })

  it('renders the wrapper container', () => {
    render(<WebDockviewShell />)
    expect(screen.getByTestId('web-dockview-shell')).toBeDefined()
  })

  it('renders with mocked dynamic import', () => {
    render(<WebDockviewShell />)
    expect(screen.getByTestId('dockview-dynamic-mock')).toBeDefined()
  })
})
