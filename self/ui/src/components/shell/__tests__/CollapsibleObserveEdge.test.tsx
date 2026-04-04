// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CollapsibleObserveEdge } from '../CollapsibleObserveEdge'

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

async function renderEdge(
  overrides: Partial<React.ComponentProps<typeof CollapsibleObserveEdge>> = {},
) {
  const defaultProps = {
    width: 20,
    onExpandToggle: vi.fn(),
    children: <div data-testid="observe-content">Observe Panel</div>,
    ...overrides,
  }
  await act(async () => {
    root.render(<CollapsibleObserveEdge {...defaultProps} />)
    await flush()
  })
  return defaultProps
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
  it('renders collapsed state with chevron when width < threshold', async () => {
    await renderEdge({ width: 20 })
    const edge = container.querySelector('[data-shell-component="collapsible-observe-edge"]')
    expect(edge?.getAttribute('data-state')).toBe('collapsed')
    expect(container.querySelector('[data-action="expand"]')).toBeTruthy()
    // Children are always in the DOM now (clipped by overflow:hidden when collapsed)
    expect(container.querySelector('[data-testid="observe-content"]')).toBeTruthy()
  })

  it('renders expanded state with children when width >= threshold', async () => {
    await renderEdge({ width: 280 })
    const edge = container.querySelector('[data-shell-component="collapsible-observe-edge"]')
    expect(edge?.getAttribute('data-state')).toBe('expanded')
    expect(container.querySelector('[data-action="expand"]')).toBeNull()
    expect(container.querySelector('[data-testid="observe-content"]')).toBeTruthy()
  })

  it('calls onExpandToggle when chevron is clicked', async () => {
    const props = await renderEdge({ width: 20 })
    const chevron = container.querySelector('[data-action="expand"]') as HTMLButtonElement
    await act(async () => {
      chevron.click()
      await flush()
    })
    expect(props.onExpandToggle).toHaveBeenCalled()
  })

  it('shows children at width exactly at threshold (60)', async () => {
    await renderEdge({ width: 60 })
    expect(container.querySelector('[data-testid="observe-content"]')).toBeTruthy()
  })

  it('shows chevron at width just below threshold (59)', async () => {
    await renderEdge({ width: 59 })
    expect(container.querySelector('[data-action="expand"]')).toBeTruthy()
    // Children are always in the DOM now (clipped by overflow:hidden when collapsed)
    expect(container.querySelector('[data-testid="observe-content"]')).toBeTruthy()
  })

  it('expand button has accessible label', async () => {
    await renderEdge({ width: 20 })
    const btn = container.querySelector('[data-action="expand"]') as HTMLButtonElement
    expect(btn.getAttribute('aria-label')).toBe('Expand observe panel')
  })

  it('renders Lucide SVG icons for expand and collapse buttons', async () => {
    // Collapsed state — expand button has ChevronLeft SVG
    await renderEdge({ width: 20 })
    const expandBtn = container.querySelector('[data-action="expand"]')
    expect(expandBtn?.querySelector('svg')).toBeTruthy()

    // Expanded state — at least one collapse button has PanelRightClose SVG
    await renderEdge({ width: 280 })
    const collapseBtns = container.querySelectorAll('[data-action="collapse"]')
    const hasSvg = Array.from(collapseBtns).some(btn => btn.querySelector('svg'))
    expect(hasSvg).toBeTruthy()
  })

  it('expand/collapse buttons have hover-capable styles (default transparent background with border-radius)', async () => {
    await renderEdge({ width: 20 })
    const expandBtn = container.querySelector('[data-action="expand"]') as HTMLElement
    // Default background is transparent, ready for hover state
    expect(expandBtn.style.background).toBe('transparent')
    expect(expandBtn.style.borderRadius).toBe('var(--nous-radius-sm)')

    await renderEdge({ width: 280 })
    const collapseBtn = container.querySelector('[data-action="collapse"]') as HTMLElement
    expect(collapseBtn.style.background).toBe('transparent')
    expect(collapseBtn.style.borderRadius).toBe('var(--nous-radius-sm)')
  })
})
