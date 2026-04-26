// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { render, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActiveAgentsIndicator } from '../ActiveAgentsIndicator'
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
 * WR-162 SP 12 (SUPV-SP12-010 + SUPV-SP12-012) — ActiveAgentsIndicator tests.
 */
describe('ActiveAgentsIndicator', () => {
  it('UT-SP12-IND-AA-RENDER-ACTIVE — renders count + active status', () => {
    const { container: c } = render(
      <ShellProvider>
        <ActiveAgentsIndicator slot={{ count: 3, status: 'active' }} />
      </ShellProvider>,
    )
    const btn = c.querySelector('[data-indicator="active-agents"]') as HTMLButtonElement
    expect(btn.getAttribute('data-status')).toBe('active')
    expect(btn.textContent).toContain('3 Ag')
  })

  it('UT-SP12-IND-AA-RENDER-IDLE — renders idle status', () => {
    const { container: c } = render(
      <ShellProvider>
        <ActiveAgentsIndicator slot={{ count: 0, status: 'idle' }} />
      </ShellProvider>,
    )
    const btn = c.querySelector('[data-indicator="active-agents"]') as HTMLButtonElement
    expect(btn.getAttribute('data-status')).toBe('idle')
    expect(btn.textContent).toContain('0 Ag')
  })

  it('UT-SP12-IND-AA-NULL-FALLBACK — renders unavailable affordance when slot is null', () => {
    const { container: c } = render(
      <ShellProvider>
        <ActiveAgentsIndicator slot={null} />
      </ShellProvider>,
    )
    const btn = c.querySelector('[data-indicator="active-agents"]') as HTMLButtonElement
    expect(btn.getAttribute('data-state')).toBe('unavailable')
    expect(btn.textContent).toBe('— Ag')
  })

  it('UT-SP12-IND-AA-CLICK-TARGET — click invokes both setters with agents + false', () => {
    const setTab = vi.fn()
    const setCollapsed = vi.fn()
    const { container: c } = render(
      <ShellProvider
        observePanelCollapsed={true}
        setActiveObserveTab={setTab}
        setObservePanelCollapsed={setCollapsed}
      >
        <ActiveAgentsIndicator slot={null} />
      </ShellProvider>,
    )
    fireEvent.click(c.querySelector('[data-indicator="active-agents"]') as HTMLButtonElement)
    expect(setTab).toHaveBeenCalledWith('agents')
    expect(setCollapsed).toHaveBeenCalledWith(false)
  })

  it('UT-SP12-IND-AA-CLICK-BATCHED — click commits exactly one re-render', async () => {
    renderCountRef.current = 0
    await act(async () => {
      root.render(
        <ShellProvider observePanelCollapsed={true}>
          <ActiveAgentsIndicator slot={null} />
          <RenderProbe />
        </ShellProvider>,
      )
      await flush()
    })
    const initial = renderCountRef.current
    const btn = container.querySelector('[data-indicator="active-agents"]') as HTMLButtonElement
    await act(async () => {
      btn.click()
      await flush()
    })
    expect(renderCountRef.current - initial).toBe(1)
  })
})
