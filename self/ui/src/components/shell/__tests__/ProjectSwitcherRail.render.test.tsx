// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectSwitcherRail } from '../ProjectSwitcherRail'

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

async function renderRail(
  overrides: Partial<React.ComponentProps<typeof ProjectSwitcherRail>> = {},
) {
  const props = {
    projects: [{ id: 'proj-1', name: 'Alpha' }],
    activeProjectId: 'proj-1',
    onProjectSelect: vi.fn(),
    ...overrides,
  }
  await act(async () => {
    root.render(<ProjectSwitcherRail {...props} />)
    await flush()
  })
  return props
}

describe('Phase 1.3 — ProjectSwitcherRail icon/color rendering (Goals C5, INV-4)', () => {
  it('renders a lucide icon for icon="lucide:Book"', async () => {
    await renderRail({
      projects: [{ id: 'proj-1', name: 'Alpha', icon: 'lucide:Book' }],
    })
    const button = container.querySelector('[data-project-id="proj-1"]') as HTMLButtonElement
    expect(button).toBeTruthy()
    // lucide-react renders an <svg>
    const svg = button.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('renders an emoji glyph for icon="emoji:🚀"', async () => {
    await renderRail({
      projects: [{ id: 'proj-1', name: 'Alpha', icon: 'emoji:🚀' }],
    })
    const button = container.querySelector('[data-project-id="proj-1"]') as HTMLButtonElement
    expect(button.textContent).toContain('🚀')
  })

  it('falls back to initial-letter when icon is undefined', async () => {
    await renderRail({
      projects: [{ id: 'proj-1', name: 'Alpha' }],
    })
    const button = container.querySelector('[data-project-id="proj-1"]') as HTMLButtonElement
    expect(button.textContent).toBe('A')
  })

  it('falls back to initial-letter for unknown lucide name (INV-4)', async () => {
    await renderRail({
      projects: [{ id: 'proj-1', name: 'Beta', icon: 'lucide:DoesNotExistFooBar999' }],
    })
    const button = container.querySelector('[data-project-id="proj-1"]') as HTMLButtonElement
    // No lucide svg should be resolved; fallback initial renders.
    expect(button.textContent).toBe('B')
    expect(button.querySelector('svg')).toBeNull()
  })

  it('falls back to initial-letter for empty emoji payload', async () => {
    await renderRail({
      projects: [{ id: 'proj-1', name: 'Gamma', icon: 'emoji:' }],
    })
    const button = container.querySelector('[data-project-id="proj-1"]') as HTMLButtonElement
    expect(button.textContent).toBe('G')
  })

  it('uses project.color as background when set', async () => {
    await renderRail({
      projects: [{ id: 'proj-1', name: 'Alpha', color: '#ff00aa' }],
    })
    const button = container.querySelector('[data-project-id="proj-1"]') as HTMLElement
    // jsdom converts hex to rgb
    expect(button.style.background.toLowerCase()).toMatch(/rgb|#ff00aa/)
  })

  it('falls back to avatarColorFromId(id) when color is unset', async () => {
    await renderRail({
      projects: [
        { id: 'proj-1', name: 'Alpha' },
        { id: 'proj-2', name: 'Beta' },
      ],
      activeProjectId: 'proj-1',
    })
    const a = container.querySelector('[data-project-id="proj-1"]') as HTMLElement
    const b = container.querySelector('[data-project-id="proj-2"]') as HTMLElement
    // Different IDs produce different hash-colors.
    expect(a.style.background).not.toBe(b.style.background)
  })

  it('renders archived projects with reduced opacity inside the archived-view disclosure', async () => {
    await renderRail({
      projects: [
        { id: 'proj-1', name: 'Alpha' },
        { id: 'proj-2', name: 'Archived', archived: true },
      ],
      activeProjectId: 'proj-1',
      archivedViewOpen: true,
      onToggleArchivedView: vi.fn(),
    })
    const wrap = container
      .querySelector('[data-project-id="proj-2"]')
      ?.parentElement as HTMLElement
    expect(wrap?.getAttribute('data-archived')).toBe('true')
    expect(wrap?.style.opacity).toBe('0.45')
  })

  it('exposes rail data attributes for active/archived counts', async () => {
    await renderRail({
      projects: [
        { id: 'proj-1', name: 'Alpha' },
        { id: 'proj-2', name: 'Beta' },
        { id: 'proj-3', name: 'Archived', archived: true },
      ],
      activeProjectId: 'proj-1',
      archivedViewOpen: false,
      onToggleArchivedView: vi.fn(),
    })
    const root = container.querySelector('[data-shell-component="project-switcher-rail"]')
    expect(root?.getAttribute('data-rail-active-count')).toBe('2')
    expect(root?.getAttribute('data-rail-archived-count')).toBe('1')
  })

  it('renders skeleton loaders when isLoading and no data', async () => {
    await renderRail({
      projects: [],
      activeProjectId: '',
      isLoading: true,
    })
    const skeletons = container.querySelectorAll('[data-testid="rail-skeleton"]')
    expect(skeletons.length).toBe(3)
  })

  it('renders error block with retry when isError and onRetry provided', async () => {
    const onRetry = vi.fn()
    await renderRail({
      projects: [],
      activeProjectId: '',
      isError: true,
      onRetry,
    })
    const btn = container.querySelector('[data-testid="rail-error-retry"]') as HTMLButtonElement
    expect(btn).toBeTruthy()
    await act(async () => {
      btn.click()
      await flush()
    })
    expect(onRetry).toHaveBeenCalled()
  })
})
