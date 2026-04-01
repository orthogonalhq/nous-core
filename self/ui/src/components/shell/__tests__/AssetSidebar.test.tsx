// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssetSidebar } from '../AssetSidebar'
import type { AssetSection, SidebarTopNavItem } from '../types'

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

const TOP_NAV: SidebarTopNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <span>D</span>, routeId: 'dashboard' },
  { id: 'inbox', label: 'Inbox', icon: <span>I</span>, routeId: 'inbox' },
]

const SECTIONS: AssetSection[] = [
  {
    id: 'workflows',
    label: 'WORKFLOWS',
    collapsible: true,
    items: [
      { id: 'wf-1', label: 'Flow A', routeId: 'workflow-a' },
      { id: 'wf-2', label: 'Flow B', routeId: 'workflow-b', indicatorColor: '#00ff00' },
    ],
    onAdd: vi.fn(),
    onSettings: vi.fn(),
  },
  {
    id: 'tasks',
    label: 'TASKS',
    collapsible: true,
    disabled: true,
    items: [
      { id: 'task-1', label: 'Task 1', routeId: 'task-1' },
    ],
  },
]

async function renderSidebar(
  overrides: Partial<React.ComponentProps<typeof AssetSidebar>> = {},
) {
  const defaultProps = {
    projectName: 'Test Project',
    topNav: TOP_NAV,
    sections: SECTIONS,
    activeRoute: 'dashboard',
    onNavigate: vi.fn(),
    ...overrides,
  }
  await act(async () => {
    root.render(<AssetSidebar {...defaultProps} />)
    await flush()
  })
  return defaultProps
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  localStorage.clear()
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
    await flush()
  })
  container.remove()
})

describe('AssetSidebar', () => {
  it('renders project name header', async () => {
    await renderSidebar()
    const header = container.querySelector('[data-sidebar-slot="header"]')
    expect(header?.textContent).toContain('Test Project')
  })

  it('renders top nav items', async () => {
    await renderSidebar()
    const dashboard = container.querySelector('[data-nav-item="dashboard"]')
    const inbox = container.querySelector('[data-nav-item="inbox"]')
    expect(dashboard).toBeTruthy()
    expect(inbox).toBeTruthy()
  })

  it('highlights active route in top nav', async () => {
    await renderSidebar({ activeRoute: 'dashboard' })
    const dashboard = container.querySelector('[data-nav-item="dashboard"]')
    expect(dashboard?.getAttribute('data-state')).toBe('active')
  })

  it('renders asset sections', async () => {
    await renderSidebar()
    expect(container.querySelector('[data-asset-section="workflows"]')).toBeTruthy()
    expect(container.querySelector('[data-asset-section="tasks"]')).toBeTruthy()
  })

  it('renders section items', async () => {
    await renderSidebar()
    expect(container.querySelector('[data-section-item="wf-1"]')).toBeTruthy()
    expect(container.querySelector('[data-section-item="wf-2"]')).toBeTruthy()
  })

  it('highlights active section item', async () => {
    await renderSidebar({ activeRoute: 'workflow-a' })
    const item = container.querySelector('[data-section-item="wf-1"]')
    expect(item?.getAttribute('data-state')).toBe('active')
  })

  it('renders indicator dot for items with indicatorColor', async () => {
    await renderSidebar()
    const wf2 = container.querySelector('[data-section-item="wf-2"]')
    const dot = wf2?.querySelector('[data-indicator]') as HTMLElement
    expect(dot).toBeTruthy()
    expect(dot.style.background).toBe('rgb(0, 255, 0)')
  })

  it('collapses section on header click and persists to localStorage', async () => {
    await renderSidebar()
    // Items visible initially
    expect(container.querySelector('[data-section-item="wf-1"]')).toBeTruthy()

    // Click collapse
    const header = container.querySelector('[data-section-header="workflows"] button') as HTMLButtonElement
    await act(async () => {
      header.click()
      await flush()
    })

    // Items hidden
    expect(container.querySelector('[data-section-item="wf-1"]')).toBeNull()

    // localStorage updated
    expect(localStorage.getItem('nous-sidebar-collapse-workflows')).toBe('true')
  })

  it('restores collapse state from localStorage', async () => {
    localStorage.setItem('nous-sidebar-collapse-workflows', 'true')
    await renderSidebar()
    // Items should be hidden
    expect(container.querySelector('[data-section-item="wf-1"]')).toBeNull()
  })

  it('disables interaction on disabled sections', async () => {
    await renderSidebar()
    const taskItem = container.querySelector('[data-section-item="task-1"]') as HTMLButtonElement
    expect(taskItem.disabled).toBe(true)
  })

  it('hides add/settings buttons on disabled sections', async () => {
    await renderSidebar()
    const taskSection = container.querySelector('[data-asset-section="tasks"]')
    expect(taskSection?.querySelector('[data-action="add"]')).toBeNull()
    expect(taskSection?.querySelector('[data-action="settings"]')).toBeNull()
  })

  it('shows add/settings buttons on enabled sections', async () => {
    await renderSidebar()
    const wfSection = container.querySelector('[data-asset-section="workflows"]')
    expect(wfSection?.querySelector('[data-action="add"]')).toBeTruthy()
    expect(wfSection?.querySelector('[data-action="settings"]')).toBeTruthy()
  })

  it('calls onNavigate when clicking a section item', async () => {
    const props = await renderSidebar()
    const item = container.querySelector('[data-section-item="wf-1"]') as HTMLButtonElement
    await act(async () => {
      item.click()
      await flush()
    })
    expect(props.onNavigate).toHaveBeenCalledWith('workflow-a')
  })

})
