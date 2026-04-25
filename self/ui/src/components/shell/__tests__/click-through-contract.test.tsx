// @vitest-environment jsdom

/**
 * WR-162 SP 11 — Click-through contract.
 *
 * SUPV-SP11-008 (fake indicator stand-in) + SUPV-SP11-009 (render-count
 * counter). The real status-bar indicator click site lands in SP 12; SP 11
 * verifies the API contract here with a `FakeIndicator` test-internal
 * component. The contract is:
 *
 *   onClick = () => {
 *     setActiveObserveTab(tab);
 *     if (observePanelCollapsed) setObservePanelCollapsed(false);
 *   };
 *
 * The two `setState` calls happen inside one synchronous handler; React
 * 18+ automatic batching collapses them into one re-render. The test
 * counts commits via `useEffect`-no-deps semantics (runs on every commit).
 *
 * Render-count counter pattern: `useRef<number>(0)` incremented inside a
 * `useEffect(() => { ref.current += 1 })` with no deps. Read the count
 * before and after the click; the delta is exactly 1.
 *
 * The test renders WITHOUT `<StrictMode>` to match production runtime.
 * No precedent file enforces this pattern; SP 11 is the first explicit
 * use of render-count counter in this package — future tests can cite
 * `click-through-contract.test.tsx` as the precedent.
 */

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShellProvider, useShellContext } from '../ShellContext'
import type { ObserveTab } from '../types'

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

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
    <div>
      <span data-testid="active-tab">{ctx.activeObserveTab}</span>
      <span data-testid="collapsed">{String(ctx.observePanelCollapsed)}</span>
    </div>
  )
}

function FakeIndicator({ tab, children }: { tab: ObserveTab; children: React.ReactNode }) {
  const { setActiveObserveTab, observePanelCollapsed, setObservePanelCollapsed } =
    useShellContext()
  const handleClick = () => {
    setActiveObserveTab(tab)
    if (observePanelCollapsed) setObservePanelCollapsed(false)
  }
  return (
    <>
      <button data-testid="fake-indicator" onClick={handleClick}>
        Indicator
      </button>
      {children}
    </>
  )
}

describe('Click-through contract', () => {
  it('UT-SP11-CLICK-BATCHED-RENDER — clicking with collapsed=true commits exactly one re-render', async () => {
    renderCountRef.current = 0
    await act(async () => {
      root.render(
        <ShellProvider observePanelCollapsed={true}>
          <FakeIndicator tab="cost-monitor">
            <RenderProbe />
          </FakeIndicator>
        </ShellProvider>,
      )
      await flush()
    })
    const initial = renderCountRef.current
    const indicator = container.querySelector('[data-testid="fake-indicator"]') as HTMLButtonElement
    await act(async () => {
      indicator.click()
      await flush()
    })
    const delta = renderCountRef.current - initial
    expect(delta).toBe(1)
  })

  it('UT-SP11-CLICK-TAB-SWITCH — collapsed=false: only activeObserveTab flips; collapsed remains false', async () => {
    await act(async () => {
      root.render(
        <ShellProvider observePanelCollapsed={false}>
          <FakeIndicator tab="system-load">
            <RenderProbe />
          </FakeIndicator>
        </ShellProvider>,
      )
      await flush()
    })
    const indicator = container.querySelector('[data-testid="fake-indicator"]') as HTMLButtonElement
    await act(async () => {
      indicator.click()
      await flush()
    })
    expect(container.querySelector('[data-testid="active-tab"]')?.textContent).toBe('system-load')
    expect(container.querySelector('[data-testid="collapsed"]')?.textContent).toBe('false')
  })

  it('UT-SP11-CLICK-COLLAPSE-AWARE — collapsed=true: activeObserveTab flips AND collapsed flips to false', async () => {
    await act(async () => {
      root.render(
        <ShellProvider observePanelCollapsed={true}>
          <FakeIndicator tab="cost-monitor">
            <RenderProbe />
          </FakeIndicator>
        </ShellProvider>,
      )
      await flush()
    })
    const indicator = container.querySelector('[data-testid="fake-indicator"]') as HTMLButtonElement
    await act(async () => {
      indicator.click()
      await flush()
    })
    expect(container.querySelector('[data-testid="active-tab"]')?.textContent).toBe('cost-monitor')
    expect(container.querySelector('[data-testid="collapsed"]')?.textContent).toBe('false')
  })

  it('UT-SP11-CLICK-FORWARDS-SETTER — host-provided setter is forward-invoked alongside the internal setter', async () => {
    const hostSetTab = vi.fn<(tab: ObserveTab) => void>()
    const hostSetCollapsed = vi.fn<(v: boolean) => void>()
    await act(async () => {
      root.render(
        <ShellProvider
          observePanelCollapsed={true}
          setActiveObserveTab={hostSetTab}
          setObservePanelCollapsed={hostSetCollapsed}
        >
          <FakeIndicator tab="system-load">
            <RenderProbe />
          </FakeIndicator>
        </ShellProvider>,
      )
      await flush()
    })
    const indicator = container.querySelector('[data-testid="fake-indicator"]') as HTMLButtonElement
    await act(async () => {
      indicator.click()
      await flush()
    })
    expect(hostSetTab).toHaveBeenCalledWith('system-load')
    expect(hostSetCollapsed).toHaveBeenCalledWith(false)
  })
})
