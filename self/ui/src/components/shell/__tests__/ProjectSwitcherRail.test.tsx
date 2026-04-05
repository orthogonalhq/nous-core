// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectSwitcherRail } from '../ProjectSwitcherRail'
import * as featureFlags from '../feature-flags'

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

const PROJECTS = [
  { id: 'proj-1', name: 'Alpha' },
  { id: 'proj-2', name: 'Beta' },
  { id: 'proj-3', name: 'Gamma' },
]

async function renderRail(
  overrides: Partial<React.ComponentProps<typeof ProjectSwitcherRail>> = {},
) {
  const defaultProps = {
    projects: PROJECTS,
    activeProjectId: 'proj-1',
    onProjectSelect: vi.fn(),
    ...overrides,
  }
  await act(async () => {
    root.render(<ProjectSwitcherRail {...defaultProps} />)
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

describe('ProjectSwitcherRail', () => {
  it('renders project avatars for each project', async () => {
    await renderRail()
    const avatars = container.querySelectorAll('[data-project-id]')
    expect(avatars.length).toBe(3)
  })

  it('shows initials when no icon is provided', async () => {
    await renderRail()
    const alpha = container.querySelector('[data-project-id="proj-1"]')
    expect(alpha?.textContent).toBe('A')
    const beta = container.querySelector('[data-project-id="proj-2"]')
    expect(beta?.textContent).toBe('B')
  })

  it('marks active project with aria-current', async () => {
    await renderRail({ activeProjectId: 'proj-2' })
    const active = container.querySelector('[data-project-id="proj-2"]')
    expect(active?.getAttribute('aria-current')).toBe('true')
    const inactive = container.querySelector('[data-project-id="proj-1"]')
    expect(inactive?.getAttribute('aria-current')).toBeNull()
  })

  it('calls onProjectSelect when clicking a project', async () => {
    const props = await renderRail()
    const avatar = container.querySelector('[data-project-id="proj-2"]') as HTMLButtonElement
    await act(async () => {
      avatar.click()
      await flush()
    })
    expect(props.onProjectSelect).toHaveBeenCalledWith('proj-2')
  })

  it('renders brand slot when provided', async () => {
    await renderRail({ brandSlot: <span data-testid="brand">NOUS</span> })
    const brand = container.querySelector('[data-rail-slot="brand"]')
    expect(brand).toBeTruthy()
    expect(brand?.textContent).toContain('NOUS')
  })

  it('does not render brand slot when omitted', async () => {
    await renderRail()
    const brand = container.querySelector('[data-rail-slot="brand"]')
    expect(brand).toBeNull()
  })

  it('renders new project button when onNewProject is provided', async () => {
    const onNew = vi.fn()
    await renderRail({ onNewProject: onNew })
    const btn = container.querySelector('[data-rail-action="new-project"]') as HTMLButtonElement
    expect(btn).toBeTruthy()
    await act(async () => {
      btn.click()
      await flush()
    })
    expect(onNew).toHaveBeenCalled()
  })

  it('does not render new project button when onNewProject is omitted', async () => {
    await renderRail()
    const btn = container.querySelector('[data-rail-action="new-project"]')
    expect(btn).toBeNull()
  })

  it('applies deterministic avatar colors based on project id', async () => {
    await renderRail()
    const avatar1 = container.querySelector('[data-project-id="proj-1"]') as HTMLElement
    const avatar2 = container.querySelector('[data-project-id="proj-2"]') as HTMLElement
    // Both should have background set (jsdom converts hsl to rgb)
    expect(avatar1.style.background).toMatch(/^rgb/)
    expect(avatar2.style.background).toMatch(/^rgb/)
    // Different IDs produce different colors
    expect(avatar1.style.background).not.toBe(avatar2.style.background)
  })

  it('renders tooltip (title) on project avatar buttons', async () => {
    await renderRail()
    const alpha = container.querySelector('[data-project-id="proj-1"]') as HTMLElement
    expect(alpha.getAttribute('title')).toBe('Alpha')
    const beta = container.querySelector('[data-project-id="proj-2"]') as HTMLElement
    expect(beta.getAttribute('title')).toBe('Beta')
  })

  it('renders active indicator side bar for active project', async () => {
    await renderRail({ activeProjectId: 'proj-1' })
    // The active project wrapper should contain the indicator span
    const activeAvatar = container.querySelector('[data-project-id="proj-1"]')
    const wrapper = activeAvatar?.parentElement
    const indicator = wrapper?.querySelector('[data-active-indicator]') as HTMLElement
    expect(indicator).toBeTruthy()
    expect(indicator.style.width).toBe('var(--nous-rail-indicator-width)')
    expect(indicator.style.background).toBe('var(--nous-fg-muted)')
  })

  it('does not render active indicator for inactive projects', async () => {
    await renderRail({ activeProjectId: 'proj-1' })
    const inactiveAvatar = container.querySelector('[data-project-id="proj-2"]')
    const wrapper = inactiveAvatar?.parentElement
    const indicator = wrapper?.querySelector('[data-active-indicator]')
    expect(indicator).toBeNull()
  })

  it('new project button renders SVG icon instead of text', async () => {
    await renderRail({ onNewProject: vi.fn() })
    const btn = container.querySelector('[data-rail-action="new-project"]')
    expect(btn?.querySelector('svg')).toBeTruthy()
  })

  // ── Home button tests ──────────────────────────────────────────────────

  describe('home button', () => {
    beforeEach(() => {
      vi.spyOn(featureFlags, 'isHomeSidebarEnabled').mockReturnValue(true)
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('renders home button when feature flag is on and onHomeClick is provided', async () => {
      await renderRail({ onHomeClick: vi.fn() })
      const btn = container.querySelector('[data-rail-action="home"]')
      expect(btn).toBeTruthy()
      expect(btn?.querySelector('svg')).toBeTruthy()
    })

    it('does not render home button when onHomeClick is not provided', async () => {
      await renderRail()
      const btn = container.querySelector('[data-rail-action="home"]')
      expect(btn).toBeNull()
    })

    it('does not render home button when feature flag is off', async () => {
      vi.spyOn(featureFlags, 'isHomeSidebarEnabled').mockReturnValue(false)
      await renderRail({ onHomeClick: vi.fn() })
      const btn = container.querySelector('[data-rail-action="home"]')
      expect(btn).toBeNull()
    })

    it('calls onHomeClick when home button is clicked', async () => {
      const onHomeClick = vi.fn()
      await renderRail({ onHomeClick })
      const btn = container.querySelector('[data-rail-action="home"]') as HTMLButtonElement
      await act(async () => {
        btn.click()
        await flush()
      })
      expect(onHomeClick).toHaveBeenCalled()
    })

    it('shows active indicator when isHomeActive is true', async () => {
      await renderRail({ onHomeClick: vi.fn(), isHomeActive: true })
      const btn = container.querySelector('[data-rail-action="home"]')
      const wrapper = btn?.parentElement
      const indicator = wrapper?.querySelector('[data-active-indicator]')
      expect(indicator).toBeTruthy()
    })

    it('does not show active indicator when isHomeActive is false', async () => {
      await renderRail({ onHomeClick: vi.fn(), isHomeActive: false })
      const btn = container.querySelector('[data-rail-action="home"]')
      const wrapper = btn?.parentElement
      const indicator = wrapper?.querySelector('[data-active-indicator]')
      expect(indicator).toBeNull()
    })

    it('renders home button with aria-label "Home"', async () => {
      await renderRail({ onHomeClick: vi.fn() })
      const btn = container.querySelector('[data-rail-action="home"]')
      expect(btn?.getAttribute('aria-label')).toBe('Home')
    })

    it('sets aria-current on home button when active', async () => {
      await renderRail({ onHomeClick: vi.fn(), isHomeActive: true })
      const btn = container.querySelector('[data-rail-action="home"]')
      expect(btn?.getAttribute('aria-current')).toBe('true')
    })
  })
})
