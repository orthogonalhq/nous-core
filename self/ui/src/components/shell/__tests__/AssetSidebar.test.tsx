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
    // Unified ListItem component uses data-list-item for both nav and section items
    const dashboard = container.querySelector('[data-list-item="dashboard"]')
    const inbox = container.querySelector('[data-list-item="inbox"]')
    expect(dashboard).toBeTruthy()
    expect(inbox).toBeTruthy()
  })

  it('highlights active route in top nav', async () => {
    await renderSidebar({ activeRoute: 'dashboard' })
    const dashboard = container.querySelector('[data-list-item="dashboard"]')
    expect(dashboard?.getAttribute('data-state')).toBe('active')
  })

  it('renders asset sections', async () => {
    await renderSidebar()
    expect(container.querySelector('[data-asset-section="workflows"]')).toBeTruthy()
    expect(container.querySelector('[data-asset-section="tasks"]')).toBeTruthy()
  })

  it('renders section items', async () => {
    await renderSidebar()
    expect(container.querySelector('[data-list-item="wf-1"]')).toBeTruthy()
    expect(container.querySelector('[data-list-item="wf-2"]')).toBeTruthy()
  })

  it('highlights active section item', async () => {
    await renderSidebar({ activeRoute: 'workflow-a' })
    const item = container.querySelector('[data-list-item="wf-1"]')
    expect(item?.getAttribute('data-state')).toBe('active')
  })

  it('renders indicator dot for items with indicatorColor', async () => {
    await renderSidebar()
    // wf-2 has indicatorColor — look for a span with that background color inside its list item
    const wf2 = container.querySelector('[data-list-item="wf-2"]')
    expect(wf2).toBeTruthy()
    // The indicator is rendered as an inline span with background color
    const allSpans = wf2!.querySelectorAll('span')
    const indicatorSpan = Array.from(allSpans).find(
      (s) => s.style.background === 'rgb(0, 255, 0)' || s.style.background === '#00ff00',
    )
    expect(indicatorSpan).toBeTruthy()
  })

  it('collapses section on header click and persists to localStorage', async () => {
    await renderSidebar()
    // Items visible initially
    const wrapper = container.querySelector('[data-section-items="workflows"]') as HTMLElement
    expect(wrapper).toBeTruthy()

    // Click collapse — find the section header button
    const header = container.querySelector('[data-section-header="workflows"] button') as HTMLButtonElement
    await act(async () => {
      header.click()
      await flush()
    })

    // Items still in DOM but clipped via maxHeight: 0
    expect(container.querySelector('[data-list-item="wf-1"]')).toBeTruthy()
    expect(wrapper.style.maxHeight).toBe('0')

    // localStorage updated
    expect(localStorage.getItem('nous-sidebar-collapse-workflows')).toBe('true')
  })

  it('restores collapse state from localStorage', async () => {
    localStorage.setItem('nous-sidebar-collapse-workflows', 'true')
    await renderSidebar()
    const wrapper = container.querySelector('[data-section-items="workflows"]') as HTMLElement
    expect(wrapper.style.maxHeight).toBe('0')
  })

  it('renders Lucide SVG icons in section headers and action buttons', async () => {
    await renderSidebar()
    // Collapse chevron should render as SVG
    const chevron = container.querySelector('[data-collapse-chevron]')
    expect(chevron?.querySelector('svg')).toBeTruthy()
    // Settings button should render as SVG
    const settingsBtn = container.querySelector('[data-action="settings"]')
    expect(settingsBtn?.querySelector('svg')).toBeTruthy()
    // Add button should render as SVG
    const addBtn = container.querySelector('[data-action="add"]')
    expect(addBtn?.querySelector('svg')).toBeTruthy()
  })

  it('collapse animation wrapper has transition property', async () => {
    await renderSidebar()
    const wrapper = container.querySelector('[data-section-items="workflows"]') as HTMLElement
    expect(wrapper.style.transition).toContain('max-height')
    expect(wrapper.style.transition).toContain('opacity')
  })

  it('disables interaction on disabled sections', async () => {
    await renderSidebar()
    const taskItem = container.querySelector('[data-list-item="task-1"]') as HTMLButtonElement
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
    const item = container.querySelector('[data-list-item="wf-1"]') as HTMLButtonElement
    await act(async () => {
      item.click()
      await flush()
    })
    expect(props.onNavigate).toHaveBeenCalledWith('workflow-a')
  })

})

describe('AssetSidebar — Live Tasks Section', () => {
  const LIVE_TASKS_SECTIONS: AssetSection[] = [
    {
      id: 'workflows',
      label: 'WORKFLOWS',
      collapsible: true,
      items: [{ id: 'wf-1', label: 'Flow A', routeId: 'workflow-a' }],
    },
    {
      id: 'tasks',
      label: 'TASKS',
      collapsible: true,
      disabled: false,
      items: [
        { id: 'task-enabled', label: 'Enabled Task', routeId: 'task-detail::task-enabled', indicatorColor: '#22c55e' },
        { id: 'task-disabled', label: 'Disabled Task', routeId: 'task-detail::task-disabled', indicatorColor: '#9ca3af' },
      ],
      onAdd: vi.fn(),
    },
    {
      id: 'teams',
      label: 'TEAMS',
      collapsible: true,
      disabled: true,
      items: [],
    },
    {
      id: 'agents',
      label: 'AGENTS',
      collapsible: true,
      disabled: true,
      items: [],
    },
  ]

  it('renders tasks section with disabled: false and clickable items', async () => {
    await renderSidebar({ sections: LIVE_TASKS_SECTIONS })
    const enabledItem = container.querySelector('[data-list-item="task-enabled"]') as HTMLButtonElement
    expect(enabledItem).toBeTruthy()
    expect(enabledItem.disabled).toBe(false)
  })

  it('shows green indicator for enabled task', async () => {
    await renderSidebar({ sections: LIVE_TASKS_SECTIONS })
    const enabledItem = container.querySelector('[data-list-item="task-enabled"]')
    const dot = enabledItem?.querySelector('span span') as HTMLElement
    expect(dot).toBeTruthy()
    expect(dot.style.background).toBe('rgb(34, 197, 94)')
  })

  it('shows gray indicator for disabled task', async () => {
    await renderSidebar({ sections: LIVE_TASKS_SECTIONS })
    const disabledItem = container.querySelector('[data-list-item="task-disabled"]')
    const dot = disabledItem?.querySelector('span span') as HTMLElement
    expect(dot).toBeTruthy()
    expect(dot.style.background).toBe('rgb(156, 163, 175)')
  })

  it('fires onAdd callback when add button is clicked', async () => {
    await renderSidebar({ sections: LIVE_TASKS_SECTIONS })
    const taskSection = container.querySelector('[data-asset-section="tasks"]')
    const addBtn = taskSection?.querySelector('[data-action="add"]') as HTMLButtonElement
    expect(addBtn).toBeTruthy()
    await act(async () => {
      addBtn.click()
      await flush()
    })
    expect(LIVE_TASKS_SECTIONS[1].onAdd).toHaveBeenCalled()
  })

  it('calls onNavigate with task-detail::taskId routeId on item click', async () => {
    const props = await renderSidebar({ sections: LIVE_TASKS_SECTIONS })
    const item = container.querySelector('[data-list-item="task-enabled"]') as HTMLButtonElement
    await act(async () => {
      item.click()
      await flush()
    })
    expect(props.onNavigate).toHaveBeenCalledWith('task-detail::task-enabled')
  })

  it('maintains section order: Workflows, Tasks, Teams, Agents', async () => {
    await renderSidebar({ sections: LIVE_TASKS_SECTIONS })
    const sections = container.querySelectorAll('[data-asset-section]')
    const ids = Array.from(sections).map((s) => s.getAttribute('data-asset-section'))
    expect(ids).toEqual(['workflows', 'tasks', 'teams', 'agents'])
  })
})

describe('AssetSidebar — Context Menu Rename', () => {
  const onItemRename = vi.fn()

  const RENAME_SECTIONS: AssetSection[] = [
    {
      id: 'workflows',
      label: 'WORKFLOWS',
      collapsible: true,
      items: [
        { id: 'wf-1', label: 'Flow A', routeId: 'workflow-a' },
        { id: 'wf-2', label: 'Flow B', routeId: 'workflow-b' },
      ],
      onItemRename,
    },
  ]

  const NO_RENAME_SECTIONS: AssetSection[] = [
    {
      id: 'workflows',
      label: 'WORKFLOWS',
      collapsible: true,
      items: [
        { id: 'wf-1', label: 'Flow A', routeId: 'workflow-a' },
      ],
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('three-dots button appears on hover for items with onItemRename', async () => {
    await renderSidebar({ sections: RENAME_SECTIONS })
    const item = container.querySelector('[data-list-item="wf-1"]') as HTMLElement
    expect(item).toBeTruthy()

    // Before hover, no dots button
    expect(container.querySelector('[data-testid="dots-button-wf-1"]')).toBeNull()

    // Hover — use pointerover + mouseover (React listens on mouseover for onMouseEnter)
    await act(async () => {
      item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      await flush()
    })

    expect(container.querySelector('[data-testid="dots-button-wf-1"]')).toBeTruthy()
  })

  it('three-dots button does not appear for items without onItemRename', async () => {
    await renderSidebar({ sections: NO_RENAME_SECTIONS })
    const item = container.querySelector('[data-list-item="wf-1"]') as HTMLElement

    await act(async () => {
      item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      await flush()
    })

    expect(container.querySelector('[data-testid="dots-button-wf-1"]')).toBeNull()
  })

  it('right-click opens context menu with Rename option', async () => {
    await renderSidebar({ sections: RENAME_SECTIONS })
    const item = container.querySelector('[data-list-item="wf-1"]') as HTMLElement

    await act(async () => {
      item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 }))
      await flush()
    })

    const contextMenu = document.querySelector('[data-testid="sidebar-context-menu"]')
    expect(contextMenu).toBeTruthy()
    const renameBtn = document.querySelector('[data-testid="context-menu-rename"]')
    expect(renameBtn).toBeTruthy()
    expect(renameBtn?.textContent).toContain('Rename')
  })

  it('clicking Rename in context menu triggers window.prompt and calls onItemRename', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('New Name')

    await renderSidebar({ sections: RENAME_SECTIONS })
    const item = container.querySelector('[data-list-item="wf-1"]') as HTMLElement

    await act(async () => {
      item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 }))
      await flush()
    })

    const renameBtn = document.querySelector('[data-testid="context-menu-rename"]') as HTMLElement
    expect(renameBtn).toBeTruthy()

    await act(async () => {
      renameBtn.click()
      await flush()
    })

    expect(promptSpy).toHaveBeenCalledWith('Rename workflow', 'Flow A')
    expect(onItemRename).toHaveBeenCalledWith('wf-1', 'New Name')

    promptSpy.mockRestore()
  })

  it('cancelling prompt does not call onItemRename', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null)

    await renderSidebar({ sections: RENAME_SECTIONS })
    const item = container.querySelector('[data-list-item="wf-1"]') as HTMLElement

    await act(async () => {
      item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 }))
      await flush()
    })

    const renameBtn = document.querySelector('[data-testid="context-menu-rename"]') as HTMLElement

    await act(async () => {
      renameBtn.click()
      await flush()
    })

    expect(onItemRename).not.toHaveBeenCalled()

    promptSpy.mockRestore()
  })

  it('window.prompt returning empty string does not call onItemRename', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('  ')

    await renderSidebar({ sections: RENAME_SECTIONS })
    const item = container.querySelector('[data-list-item="wf-1"]') as HTMLElement

    await act(async () => {
      item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 }))
      await flush()
    })

    const renameBtn = document.querySelector('[data-testid="context-menu-rename"]') as HTMLElement

    await act(async () => {
      renameBtn.click()
      await flush()
    })

    expect(onItemRename).not.toHaveBeenCalled()

    promptSpy.mockRestore()
  })

  it('context menu closes on Escape', async () => {
    await renderSidebar({ sections: RENAME_SECTIONS })
    const item = container.querySelector('[data-list-item="wf-1"]') as HTMLElement

    await act(async () => {
      item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 }))
      await flush()
    })

    expect(document.querySelector('[data-testid="sidebar-context-menu"]')).toBeTruthy()

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await flush()
    })

    expect(document.querySelector('[data-testid="sidebar-context-menu"]')).toBeNull()
  })

  it('single-click navigates immediately (no delay) when onItemRename is provided', async () => {
    const props = await renderSidebar({ sections: RENAME_SECTIONS })
    const item = container.querySelector('[data-list-item="wf-1"]') as HTMLButtonElement

    await act(async () => {
      item.click()
      await flush()
    })

    // Should navigate immediately — no setTimeout delay
    expect(props.onNavigate).toHaveBeenCalledWith('workflow-a')
  })
})
