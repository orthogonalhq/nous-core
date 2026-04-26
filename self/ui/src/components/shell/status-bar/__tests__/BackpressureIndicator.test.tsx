// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { render, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BackpressureIndicator } from '../BackpressureIndicator'
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
  return (
    <span data-testid="active-tab">{ctx.activeObserveTab}</span>
  )
}

/**
 * WR-162 SP 12 (SUPV-SP12-008 + SUPV-SP12-012) — BackpressureIndicator tests.
 */
describe('BackpressureIndicator', () => {
  it('UT-SP12-IND-BP-RENDER-NOMINAL — renders nominal state with queue/agents tooltip', () => {
    const { container: c } = render(
      <ShellProvider>
        <BackpressureIndicator slot={{ state: 'nominal', queueDepth: 5, activeAgents: 3 }} />
      </ShellProvider>,
    )
    const btn = c.querySelector('[data-indicator="backpressure"]') as HTMLButtonElement
    expect(btn).toBeTruthy()
    expect(btn.getAttribute('data-state')).toBe('nominal')
    expect(btn.textContent).toContain('OK')
    expect(btn.getAttribute('title')).toContain('Queue 5')
    expect(btn.getAttribute('title')).toContain('3 agents')
  })

  it('UT-SP12-IND-BP-RENDER-CRITICAL — renders critical state', () => {
    const { container: c } = render(
      <ShellProvider>
        <BackpressureIndicator slot={{ state: 'critical', queueDepth: 99, activeAgents: 12 }} />
      </ShellProvider>,
    )
    const btn = c.querySelector('[data-indicator="backpressure"]') as HTMLButtonElement
    expect(btn.getAttribute('data-state')).toBe('critical')
    expect(btn.textContent).toContain('Critical')
  })

  it('UT-SP12-IND-BP-NULL-FALLBACK — renders unavailable affordance when slot is null', () => {
    const { container: c } = render(
      <ShellProvider>
        <BackpressureIndicator slot={null} />
      </ShellProvider>,
    )
    const btn = c.querySelector('[data-indicator="backpressure"]') as HTMLButtonElement
    expect(btn.getAttribute('data-state')).toBe('unavailable')
    expect(btn.textContent).toBe('— BP')
  })

  it('UT-SP12-IND-BP-CLICK-TARGET — click invokes both setters with system-load + false', () => {
    const setTab = vi.fn()
    const setCollapsed = vi.fn()
    const { container: c } = render(
      <ShellProvider
        observePanelCollapsed={true}
        setActiveObserveTab={setTab}
        setObservePanelCollapsed={setCollapsed}
      >
        <BackpressureIndicator slot={null} />
      </ShellProvider>,
    )
    const btn = c.querySelector('[data-indicator="backpressure"]') as HTMLButtonElement
    fireEvent.click(btn)
    expect(setTab).toHaveBeenCalledWith('system-load')
    expect(setCollapsed).toHaveBeenCalledWith(false)
  })

  it('UT-SP12-IND-BP-CLICK-BATCHED — click commits exactly one re-render', async () => {
    renderCountRef.current = 0
    await act(async () => {
      root.render(
        <ShellProvider observePanelCollapsed={true}>
          <BackpressureIndicator slot={null} />
          <RenderProbe />
        </ShellProvider>,
      )
      await flush()
    })
    const initial = renderCountRef.current
    const btn = container.querySelector('[data-indicator="backpressure"]') as HTMLButtonElement
    await act(async () => {
      btn.click()
      await flush()
    })
    const delta = renderCountRef.current - initial
    expect(delta).toBe(1)
  })
})
