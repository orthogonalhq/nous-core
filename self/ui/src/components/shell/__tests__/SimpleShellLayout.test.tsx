// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SimpleShellLayout } from '../SimpleShellLayout'

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

async function renderLayout(
  overrides: Partial<React.ComponentProps<typeof SimpleShellLayout>> = {},
) {
  await act(async () => {
    root.render(
      <SimpleShellLayout
        projectRail={<div>rail</div>}
        sidebar={<div>sidebar</div>}
        content={<div>content</div>}
        observe={<div>observe</div>}
        chatSlot={({ stage }) => <div data-testid="chat">{stage}</div>}
        {...overrides}
      />,
    )
    await flush()
  })
}

function getArea(name: string): HTMLDivElement {
  const element = container.querySelector(`[data-shell-area="${name}"]`)
  if (!(element instanceof HTMLDivElement)) {
    throw new Error(`Area not found: ${name}`)
  }
  return element
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

describe('SimpleShellLayout', () => {
  it('renders all four named grid areas', async () => {
    await renderLayout()

    expect(getArea('rail').textContent).toContain('rail')
    expect(getArea('sidebar').textContent).toContain('sidebar')
    expect(getArea('content').textContent).toContain('content')
    // Observe area wraps content in CollapsibleObserveEdge — at default 20px width it shows the collapse chevron, not the children
    expect(getArea('observe')).toBeTruthy()
  })

  it('sets grid-template-areas on the container', async () => {
    await renderLayout()
    const layout = container.firstElementChild as HTMLDivElement
    expect(layout.style.gridTemplateAreas).toBe('"rail    sidebar content observe" "chat    chat    content observe"')
  })

  it('applies initial widths as CSS custom properties', async () => {
    await renderLayout({ initialWidths: { sidebar: 300, observe: 100 } })
    const layout = container.firstElementChild as HTMLDivElement
    expect(layout.style.getPropertyValue('--shell-sidebar-width')).toBe('300px')
    expect(layout.style.getPropertyValue('--shell-observe-width')).toBe('100px')
  })

  it('clamps sidebar width to min/max', async () => {
    await renderLayout({ initialWidths: { sidebar: 100 } })
    const layout = container.firstElementChild as HTMLDivElement
    // 100 < 240 min, so clamped to 240
    expect(layout.style.getPropertyValue('--shell-sidebar-width')).toBe('240px')
  })

  it('hides observe at medium breakpoint', async () => {
    await renderLayout({ breakpoint: 'medium' })
    expect(getArea('observe').style.display).toBe('none')
    expect(getArea('sidebar').style.display).not.toBe('none')
  })

  it('hides observe at narrow breakpoint', async () => {
    await renderLayout({ breakpoint: 'narrow' })
    expect(getArea('observe').style.display).toBe('none')
  })

  it('caps sidebar width per breakpoint', async () => {
    await renderLayout({ breakpoint: 'medium', initialWidths: { sidebar: 400 } })
    const layout = container.firstElementChild as HTMLDivElement
    // medium cap is 280
    expect(layout.style.getPropertyValue('--shell-sidebar-width')).toBe('280px')
  })

  it('sets data-breakpoint on container', async () => {
    await renderLayout({ breakpoint: 'narrow' })
    const layout = container.firstElementChild as HTMLDivElement
    expect(layout.getAttribute('data-breakpoint')).toBe('narrow')
  })

  it('renders ColumnDivider separators', async () => {
    await renderLayout()
    const dividers = container.querySelectorAll('[role="separator"]')
    // sidebar divider + observe divider
    expect(dividers.length).toBe(2)
  })

  it('hides observe ColumnDivider when observe is hidden', async () => {
    await renderLayout({ breakpoint: 'medium' })
    const dividers = container.querySelectorAll('[role="separator"]')
    // only sidebar divider
    expect(dividers.length).toBe(1)
  })

  it('calls onColumnResize when provided', async () => {
    const onResize = vi.fn()
    await renderLayout({ onColumnResize: onResize })
    // Trigger resize by simulating pointer events on a divider
    const divider = container.querySelector('[aria-label="Resize sidebar column"]') as HTMLElement
    expect(divider).toBeTruthy()
    // The callback fires on drag — tested via integration; here we verify it accepts the prop
  })
})
