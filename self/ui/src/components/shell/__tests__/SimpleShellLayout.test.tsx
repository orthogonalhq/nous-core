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

// Mock ResizeObserver
class MockResizeObserver {
  callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  ;(globalThis as any).ResizeObserver = MockResizeObserver
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

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
        chatStage="small"
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

afterEach(async () => {
  await act(async () => {
    root.unmount()
    await flush()
  })
  container.remove()
})

describe('SimpleShellLayout', () => {
  it('renders all four named grid areas plus chat overlay', async () => {
    await renderLayout()

    expect(getArea('rail').textContent).toContain('rail')
    expect(getArea('sidebar').textContent).toContain('sidebar')
    expect(getArea('content').textContent).toContain('content')
    expect(getArea('observe')).toBeTruthy()
    expect(getArea('chat')).toBeTruthy()
  })

  it('uses shell-specific frame and canvas tokens for visible workspace fidelity', async () => {
    await renderLayout()
    const layout = container.firstElementChild as HTMLDivElement
    expect(layout.style.background).toBe('var(--nous-workspace-shell-frame-bg)')
    expect(layout.style.border).toBe('1px solid var(--nous-workspace-shell-border)')
    const content = getArea('content')
    expect(content.getAttribute('data-visual-shell-fidelity')).toBe('workspace-canvas')
    expect(content.getAttribute('style')).toContain('var(--nous-workspace-canvas-overlay)')
    expect(content.getAttribute('style')).toContain('var(--nous-workspace-shell-border)')
  })

  it('sets single-row grid-template-areas on the container', async () => {
    await renderLayout()
    const layout = container.firstElementChild as HTMLDivElement
    expect(layout.style.gridTemplateAreas).toBe('"rail sidebar . content . observe"')
  })

  it('uses single-row grid (1fr)', async () => {
    await renderLayout()
    const layout = container.firstElementChild as HTMLDivElement
    expect(layout.style.gridTemplateRows).toBe('minmax(0, 1fr)')
  })

  it('chat drawer is positioned as a Cortex Principal simple-shell container', async () => {
    await renderLayout()
    const chat = getArea('chat')
    expect(chat.style.position).toBe('absolute')
    expect(chat.style.bottom).toBe('var(--nous-chat-drawer-bottom-offset)')
    expect(chat.style.left).toBe('var(--nous-chat-drawer-left-offset)')
    expect(chat.style.zIndex).toBe('10')
    expect(chat.getAttribute('data-chat-owner')).toBe('Cortex:Principal')
    expect(chat.getAttribute('data-chat-container')).toBe('principal-drawer')
    expect(chat.getAttribute('role')).toBe('complementary')
    expect(chat.getAttribute('aria-label')).toBe('Cortex Principal chat drawer')
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
    // Observe area is always in the DOM; grid column shrinks to 0px at non-full breakpoints
    const layout = container.firstElementChild as HTMLDivElement
    const columns = layout.style.gridTemplateColumns
    expect(columns).toContain('0px')
  })

  it('hides observe at narrow breakpoint', async () => {
    await renderLayout({ breakpoint: 'narrow' })
    const layout = container.firstElementChild as HTMLDivElement
    const columns = layout.style.gridTemplateColumns
    expect(columns).toContain('0px')
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

  it('renders sidebar ColumnDivider (observe collapsed by default)', async () => {
    await renderLayout()
    const dividers = container.querySelectorAll('[role="separator"]')
    expect(dividers.length).toBe(1)
  })

  it('renders both ColumnDividers when observe is expanded', async () => {
    await renderLayout({ initialWidths: { observe: 280 } })
    const dividers = container.querySelectorAll('[role="separator"]')
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
    const divider = container.querySelector('[aria-label="Resize sidebar column"]') as HTMLElement
    expect(divider).toBeTruthy()
  })

  it('chat drawer has transition for smooth animation', async () => {
    await renderLayout()
    const chat = getArea('chat')
    expect(chat.style.transition).toBe('width var(--nous-duration-slow) var(--nous-ease-out), height var(--nous-duration-slow) var(--nous-ease-out), background var(--nous-duration-slow) var(--nous-ease-out)')
  })

  it('sets data-chat-stage attribute on chat overlay', async () => {
    await renderLayout({ chatStage: 'ambient_large' })
    const chat = getArea('chat')
    expect(chat.getAttribute('data-chat-stage')).toBe('ambient_large')
  })

  it('keeps small and ambient_small stages scoped to the rail and asset-sidebar drawer width', async () => {
    await renderLayout({ chatStage: 'small' })
    let chat = getArea('chat')
    expect(chat.style.width).toBe('var(--shell-chat-drawer-collapsed-width)')

    await act(async () => {
      root.render(
        <SimpleShellLayout
          projectRail={<div>rail</div>}
          sidebar={<div>sidebar</div>}
          content={<div>content</div>}
          observe={<div>observe</div>}
          chatSlot={({ stage }) => <div data-testid="chat">{stage}</div>}
          chatStage="ambient_small"
        />,
      )
      await flush()
    })
    chat = getArea('chat')
    expect(chat.style.width).toBe('var(--shell-chat-drawer-collapsed-width)')
  })

  it('expands ambient_large and full stages without creating drawer-local stage state', async () => {
    await renderLayout({ chatStage: 'ambient_large' })
    let chat = getArea('chat')
    expect(chat.style.width).toBe('min(var(--nous-chat-drawer-expanded-width), var(--shell-chat-drawer-available-width))')
    expect(chat.style.maxWidth).toBe('var(--shell-chat-drawer-available-width)')

    await act(async () => {
      root.render(
        <SimpleShellLayout
          projectRail={<div>rail</div>}
          sidebar={<div>sidebar</div>}
          content={<div>content</div>}
          observe={<div>observe</div>}
          chatSlot={({ stage }) => <div data-testid="chat">{stage}</div>}
          chatStage="full"
        />,
      )
      await flush()
    })
    chat = getArea('chat')
    expect(chat.style.width).toBe('var(--shell-chat-drawer-available-width)')
    expect(chat.getAttribute('data-chat-stage')).toBe('full')
  })

  it('sets the available drawer width from desktop observe geometry', async () => {
    await renderLayout({ initialWidths: { observe: 280 } })
    const layout = container.firstElementChild as HTMLDivElement
    expect(layout.style.getPropertyValue('--shell-chat-drawer-available-width')).toBe(
      'calc(100% - var(--shell-observe-width) - 5px)',
    )

    await act(async () => {
      root.render(
        <SimpleShellLayout
          projectRail={<div>rail</div>}
          sidebar={<div>sidebar</div>}
          content={<div>content</div>}
          observe={<div>observe</div>}
          chatSlot={({ stage }) => <div data-testid="chat">{stage}</div>}
          chatStage="small"
          breakpoint="medium"
        />,
      )
      await flush()
    })
    const nextLayout = container.firstElementChild as HTMLDivElement
    expect(nextLayout.style.getPropertyValue('--shell-chat-drawer-available-width')).toBe('100%')
  })

  // ── WR-141: whole-sidebar collapse ────────────────────────────────────
  it('substitutes --shell-sidebar-width with var(--nous-asset-sidebar-collapsed-width) when sidebarCollapsed={true}', async () => {
    await renderLayout({ sidebarCollapsed: true, initialWidths: { sidebar: 300 } })
    const layout = container.firstElementChild as HTMLDivElement
    // JSDOM reports inline CSS custom properties as written, not resolved
    expect(layout.style.getPropertyValue('--shell-sidebar-width')).toContain(
      'var(--nous-asset-sidebar-collapsed-width)',
    )
  })

  it('restores --shell-sidebar-width to the prior pixel value when sidebarCollapsed flips from true to false', async () => {
    // Start collapsed with initial sidebar width 300
    await renderLayout({ sidebarCollapsed: true, initialWidths: { sidebar: 300 } })
    let layout = container.firstElementChild as HTMLDivElement
    expect(layout.style.getPropertyValue('--shell-sidebar-width')).toContain(
      'var(--nous-asset-sidebar-collapsed-width)',
    )
    // Re-render with collapsed=false — the underlying sidebarWidth state is still 300
    await act(async () => {
      root.render(
        <SimpleShellLayout
          projectRail={<div>rail</div>}
          sidebar={<div>sidebar</div>}
          content={<div>content</div>}
          observe={<div>observe</div>}
          chatSlot={({ stage }) => <div data-testid="chat">{stage}</div>}
          chatStage="small"
          sidebarCollapsed={false}
          initialWidths={{ sidebar: 300 }}
        />,
      )
      await flush()
    })
    layout = container.firstElementChild as HTMLDivElement
    expect(layout.style.getPropertyValue('--shell-sidebar-width')).toBe('300px')
  })

  it('does not render the sidebar ColumnDivider when sidebarCollapsed={true}', async () => {
    await renderLayout({ sidebarCollapsed: true })
    const sidebarDivider = container.querySelector('[aria-label="Resize sidebar column"]')
    expect(sidebarDivider).toBeNull()
  })

  it('chat drawer carries min-width: var(--nous-chat-overlay-min-width) regardless of sidebarCollapsed state', async () => {
    // Default (sidebarCollapsed undefined)
    await renderLayout()
    let chat = getArea('chat')
    expect(chat.style.minWidth).toBe('var(--nous-chat-overlay-min-width)')

    // Re-render with sidebarCollapsed: true
    await act(async () => {
      root.render(
        <SimpleShellLayout
          projectRail={<div>rail</div>}
          sidebar={<div>sidebar</div>}
          content={<div>content</div>}
          observe={<div>observe</div>}
          chatSlot={({ stage }) => <div data-testid="chat">{stage}</div>}
          chatStage="small"
          sidebarCollapsed={true}
        />,
      )
      await flush()
    })
    chat = getArea('chat')
    expect(chat.style.minWidth).toBe('var(--nous-chat-overlay-min-width)')
  })
})
