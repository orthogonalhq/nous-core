// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CollapsibleObserveEdge } from '../CollapsibleObserveEdge'
import { ShellProvider } from '../ShellContext'

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

interface RenderOverrides {
  width?: number
  expandedWidth?: number
  onExpandToggle?: () => void
  collapsed?: boolean
  setCollapsed?: (v: boolean) => void
}

let renderSeq = 0

async function renderEdge(overrides: RenderOverrides = {}) {
  const props = {
    width: overrides.width ?? 20,
    expandedWidth: overrides.expandedWidth ?? 280,
    onExpandToggle: overrides.onExpandToggle ?? vi.fn(),
    children: <div data-testid="observe-content">Observe Panel</div>,
  }
  const collapsed = overrides.collapsed ?? props.width < 60
  // Use a fresh `key` on each render so ShellProvider remounts and the
  // uncontrolled `useState` re-seeds from the new prop value.
  renderSeq += 1
  await act(async () => {
    root.render(
      <ShellProvider
        key={renderSeq}
        observePanelCollapsed={collapsed}
        setObservePanelCollapsed={overrides.setCollapsed}
      >
        <CollapsibleObserveEdge {...props} />
      </ShellProvider>,
    )
    await flush()
  })
  return props
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

describe('CollapsibleObserveEdge', () => {
  it('renders collapsed state when shell-context observePanelCollapsed === true', async () => {
    await renderEdge({ collapsed: true })
    const edge = container.querySelector('[data-shell-component="collapsible-observe-edge"]')
    expect(edge?.getAttribute('data-state')).toBe('collapsed')
    expect(container.querySelector('[data-action="expand"]')).toBeTruthy()
    // Children are always in the DOM (clipped by overflow:hidden when collapsed)
    expect(container.querySelector('[data-testid="observe-content"]')).toBeTruthy()
  })

  it('renders expanded state when shell-context observePanelCollapsed === false', async () => {
    await renderEdge({ collapsed: false })
    const edge = container.querySelector('[data-shell-component="collapsible-observe-edge"]')
    expect(edge?.getAttribute('data-state')).toBe('expanded')
    expect(container.querySelector('[data-action="expand"]')).toBeNull()
    expect(container.querySelector('[data-testid="observe-content"]')).toBeTruthy()
  })

  it('calls onExpandToggle when chevron is clicked', async () => {
    const onExpandToggle = vi.fn()
    await renderEdge({ collapsed: true, onExpandToggle })
    const chevron = container.querySelector('[data-action="expand"]') as HTMLButtonElement
    await act(async () => {
      chevron.click()
      await flush()
    })
    expect(onExpandToggle).toHaveBeenCalled()
  })

  it('expand button has accessible label', async () => {
    await renderEdge({ collapsed: true })
    const btn = container.querySelector('[data-action="expand"]') as HTMLButtonElement
    expect(btn.getAttribute('aria-label')).toBe('Expand observe panel')
  })

  it('renders Lucide SVG icons for expand and collapse buttons', async () => {
    // Collapsed state — expand button has ChevronLeft SVG
    await renderEdge({ collapsed: true })
    const expandBtn = container.querySelector('[data-action="expand"]')
    expect(expandBtn?.querySelector('svg')).toBeTruthy()

    // Expanded state — at least one collapse button has PanelRightClose SVG
    await renderEdge({ collapsed: false })
    const collapseBtns = container.querySelectorAll('[data-action="collapse"]')
    const hasSvg = Array.from(collapseBtns).some((btn) => btn.querySelector('svg'))
    expect(hasSvg).toBeTruthy()
  })

  it('expand/collapse buttons have hover-capable styles (default transparent background with border-radius)', async () => {
    await renderEdge({ collapsed: true })
    const expandBtn = container.querySelector('[data-action="expand"]') as HTMLElement
    expect(expandBtn.style.background).toBe('transparent')
    expect(expandBtn.style.borderRadius).toBe('var(--nous-radius-sm)')

    await renderEdge({ collapsed: false })
    const collapseBtn = container.querySelector('[data-action="collapse"]') as HTMLElement
    expect(collapseBtn.style.background).toBe('transparent')
    expect(collapseBtn.style.borderRadius).toBe('var(--nous-radius-sm)')
  })

  // ----- WR-162 SP 11 (SUPV-SP11-004 + SUPV-SP11-005) regression guards -----

  it('UT-SP11-EDGE-READ-FROM-CONTEXT — data-state derives from context, not from the width prop', async () => {
    // Pass a small width that would have been "collapsed" under the pre-SP-11
    // pixel-threshold heuristic; the context says expanded → state is expanded.
    await renderEdge({ width: 5, collapsed: false })
    let edge = container.querySelector('[data-shell-component="collapsible-observe-edge"]')
    expect(edge?.getAttribute('data-state')).toBe('expanded')

    // Now flip context to collapsed with the SAME small width.
    await renderEdge({ width: 5, collapsed: true })
    edge = container.querySelector('[data-shell-component="collapsible-observe-edge"]')
    expect(edge?.getAttribute('data-state')).toBe('collapsed')
  })

  it('UT-SP11-EDGE-CLICK-WRITES-CONTEXT — clicking writes the negated value to the context setter and invokes onExpandToggle', async () => {
    const setCollapsed = vi.fn()
    const onExpandToggle = vi.fn()
    await renderEdge({ collapsed: false, onExpandToggle, setCollapsed })
    const collapseBtn = container.querySelector('[data-action="collapse"]') as HTMLButtonElement
    await act(async () => {
      collapseBtn.click()
      await flush()
    })
    expect(setCollapsed).toHaveBeenCalledTimes(1)
    expect(setCollapsed).toHaveBeenCalledWith(true)
    expect(onExpandToggle).toHaveBeenCalledTimes(1)
  })
})
