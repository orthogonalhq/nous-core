// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { render, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BudgetIndicator, formatPeriod } from '../BudgetIndicator'
import { ShellProvider, useShellContext } from '../../ShellContext'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

let container: HTMLDivElement
let root: Root

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
    await flush()
  })
  container.remove()
})

const renderCountRef = { current: 0 }

function RenderProbe() {
  React.useEffect(() => {
    renderCountRef.current += 1
  })
  const ctx = useShellContext()
  return <span data-testid="active-tab">{ctx.activeObserveTab}</span>
}

/**
 * WR-162 SP 12 (SUPV-SP12-009 + SUPV-SP12-012) — BudgetIndicator tests.
 */
describe('BudgetIndicator', () => {
  it('UT-SP12-IND-BG-RENDER-NOMINAL — renders spent/ceiling with period in tooltip', () => {
    const { container: c } = render(
      <ShellProvider>
        <BudgetIndicator
          slot={{ state: 'nominal', spent: 14.7, ceiling: 20, period: '2026-04-01T00:00:00Z' }}
        />
      </ShellProvider>,
    )
    const btn = c.querySelector('[data-indicator="budget"]') as HTMLButtonElement
    expect(btn.getAttribute('data-state')).toBe('nominal')
    expect(btn.textContent).toContain('$14.70')
    expect(btn.textContent).toContain('$20.00')
    // Locale-dependent; Intl.DateTimeFormat({ year: 'numeric', month: 'short' }) on Apr 2026
    // produces something like "Apr 2026" in en-US.
    expect(btn.getAttribute('title')).toMatch(/2026/)
  })

  it('UT-SP12-IND-BG-RENDER-EXCEEDED — renders exceeded data-state', () => {
    const { container: c } = render(
      <ShellProvider>
        <BudgetIndicator
          slot={{ state: 'exceeded', spent: 25, ceiling: 20, period: '2026-04-01T00:00:00Z' }}
        />
      </ShellProvider>,
    )
    const btn = c.querySelector('[data-indicator="budget"]') as HTMLButtonElement
    expect(btn.getAttribute('data-state')).toBe('exceeded')
  })

  it('UT-SP12-IND-BG-NULL-FALLBACK — renders unavailable affordance when slot is null', () => {
    const { container: c } = render(
      <ShellProvider>
        <BudgetIndicator slot={null} />
      </ShellProvider>,
    )
    const btn = c.querySelector('[data-indicator="budget"]') as HTMLButtonElement
    expect(btn.getAttribute('data-state')).toBe('unavailable')
    expect(btn.textContent).toBe('— $')
  })

  it('UT-SP12-IND-BG-CLICK-TARGET — click invokes both setters with cost-monitor + false', () => {
    const setTab = vi.fn()
    const setCollapsed = vi.fn()
    const { container: c } = render(
      <ShellProvider
        observePanelCollapsed={true}
        setActiveObserveTab={setTab}
        setObservePanelCollapsed={setCollapsed}
      >
        <BudgetIndicator slot={null} />
      </ShellProvider>,
    )
    fireEvent.click(c.querySelector('[data-indicator="budget"]') as HTMLButtonElement)
    expect(setTab).toHaveBeenCalledWith('cost-monitor')
    expect(setCollapsed).toHaveBeenCalledWith(false)
  })

  it('UT-SP12-IND-BG-FORMAT-PERIOD-MALFORMED — graceful fall-through on bad ISO', () => {
    expect(formatPeriod('not-an-iso')).toBe('not-an-iso')
  })

  it('UT-SP12-IND-BG-CLICK-BATCHED — click commits exactly one re-render', async () => {
    renderCountRef.current = 0
    await act(async () => {
      root.render(
        <ShellProvider observePanelCollapsed={true}>
          <BudgetIndicator slot={null} />
          <RenderProbe />
        </ShellProvider>,
      )
      await flush()
    })
    const initial = renderCountRef.current
    const btn = container.querySelector('[data-indicator="budget"]') as HTMLButtonElement
    await act(async () => {
      btn.click()
      await flush()
    })
    expect(renderCountRef.current - initial).toBe(1)
  })
})
