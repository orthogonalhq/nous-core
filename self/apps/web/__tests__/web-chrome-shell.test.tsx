// @vitest-environment jsdom

import * as React from 'react'
import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { WebChromeShell } from '@/components/shell/web-chrome-shell'

describe('WebChromeShell', () => {
  afterEach(() => { cleanup() })
  it('renders WebHeader within the shell', () => {
    render(
      <WebChromeShell mode="simple" onModeToggle={() => {}}>
        <div>content</div>
      </WebChromeShell>,
    )
    expect(screen.getByTestId('web-header')).toBeDefined()
  })

  it('renders children in the content area', () => {
    render(
      <WebChromeShell mode="simple" onModeToggle={() => {}}>
        <div data-testid="test-child">Hello</div>
      </WebChromeShell>,
    )
    expect(screen.getByTestId('test-child').textContent).toBe('Hello')
  })

  it('renders WebStatusBar within the shell', () => {
    render(
      <WebChromeShell mode="simple" onModeToggle={() => {}}>
        <div>content</div>
      </WebChromeShell>,
    )
    expect(screen.getByTestId('web-status-bar')).toBeDefined()
  })

  it('root element has correct styles for full-viewport layout', () => {
    render(
      <WebChromeShell mode="simple" onModeToggle={() => {}}>
        <div>content</div>
      </WebChromeShell>,
    )
    const root = screen.getByTestId('web-chrome-shell')
    expect(root.style.height).toBe('100vh')
    expect(root.style.overflow).toBe('hidden')
  })

  it('sets data-shell-mode attribute', () => {
    render(
      <WebChromeShell mode="developer" onModeToggle={() => {}}>
        <div>content</div>
      </WebChromeShell>,
    )
    const root = screen.getByTestId('web-chrome-shell')
    expect(root.getAttribute('data-shell-mode')).toBe('developer')
  })
})
