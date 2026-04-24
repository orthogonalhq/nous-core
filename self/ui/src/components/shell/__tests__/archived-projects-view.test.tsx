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

describe('Phase 1.3 — Archived projects view (Goals C7)', () => {
  it('archived-view toggle is hidden when no archived projects and not opened', async () => {
    await act(async () => {
      root.render(
        <ProjectSwitcherRail
          projects={[{ id: 'proj-1', name: 'Alpha' }]}
          activeProjectId="proj-1"
          onProjectSelect={vi.fn()}
          onToggleArchivedView={vi.fn()}
          archivedViewOpen={false}
        />,
      )
      await flush()
    })
    expect(container.querySelector('[data-testid="rail-archived-toggle"]')).toBeNull()
  })

  it('archived-view toggle shows count when archived projects exist', async () => {
    await act(async () => {
      root.render(
        <ProjectSwitcherRail
          projects={[
            { id: 'proj-1', name: 'Alpha' },
            { id: 'proj-2', name: 'Archived-A', archived: true },
            { id: 'proj-3', name: 'Archived-B', archived: true },
          ]}
          activeProjectId="proj-1"
          onProjectSelect={vi.fn()}
          onToggleArchivedView={vi.fn()}
          archivedViewOpen={false}
        />,
      )
      await flush()
    })
    const toggle = container.querySelector('[data-testid="rail-archived-toggle"]')
    expect(toggle?.textContent).toContain('Archived (2)')
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
  })

  it('clicking toggle fires onToggleArchivedView', async () => {
    const onToggle = vi.fn()
    await act(async () => {
      root.render(
        <ProjectSwitcherRail
          projects={[
            { id: 'proj-1', name: 'Alpha' },
            { id: 'proj-2', name: 'Archived-A', archived: true },
          ]}
          activeProjectId="proj-1"
          onProjectSelect={vi.fn()}
          onToggleArchivedView={onToggle}
          archivedViewOpen={false}
        />,
      )
      await flush()
    })
    const toggle = container.querySelector('[data-testid="rail-archived-toggle"]') as HTMLButtonElement
    await act(async () => {
      toggle.click()
      await flush()
    })
    expect(onToggle).toHaveBeenCalled()
  })

  it('expanded disclosure renders archived avatars at reduced opacity', async () => {
    await act(async () => {
      root.render(
        <ProjectSwitcherRail
          projects={[
            { id: 'proj-1', name: 'Alpha' },
            { id: 'proj-2', name: 'Archived', archived: true },
          ]}
          activeProjectId="proj-1"
          onProjectSelect={vi.fn()}
          onToggleArchivedView={vi.fn()}
          archivedViewOpen={true}
        />,
      )
      await flush()
    })
    const list = container.querySelector('[data-testid="rail-archived-list"]')
    expect(list).toBeTruthy()
    const archivedButton = list?.querySelector('[data-project-id="proj-2"]') as HTMLButtonElement
    expect(archivedButton).toBeTruthy()
    const wrap = archivedButton.parentElement as HTMLElement
    expect(wrap?.style.opacity).toBe('0.45')
  })

  it('clicking an archived avatar does NOT invoke onProjectSelect', async () => {
    const onSelect = vi.fn()
    await act(async () => {
      root.render(
        <ProjectSwitcherRail
          projects={[
            { id: 'proj-1', name: 'Alpha' },
            { id: 'proj-2', name: 'Archived', archived: true },
          ]}
          activeProjectId="proj-1"
          onProjectSelect={onSelect}
          onToggleArchivedView={vi.fn()}
          archivedViewOpen={true}
        />,
      )
      await flush()
    })
    const archivedButton = container.querySelector(
      '[data-testid="rail-archived-list"] [data-project-id="proj-2"]',
    ) as HTMLButtonElement
    await act(async () => {
      archivedButton.click()
      await flush()
    })
    expect(onSelect).not.toHaveBeenCalledWith('proj-2')
  })

  it('shows empty-state message when expanded but no archived projects', async () => {
    await act(async () => {
      root.render(
        <ProjectSwitcherRail
          projects={[{ id: 'proj-1', name: 'Alpha' }]}
          activeProjectId="proj-1"
          onProjectSelect={vi.fn()}
          onToggleArchivedView={vi.fn()}
          archivedViewOpen={true}
        />,
      )
      await flush()
    })
    const empty = container.querySelector('[data-testid="rail-archived-empty"]')
    expect(empty?.textContent).toContain('No archived projects')
  })

  it('renders archived-list loading skeletons when archivedIsLoading is true', async () => {
    await act(async () => {
      root.render(
        <ProjectSwitcherRail
          projects={[{ id: 'proj-1', name: 'Alpha' }]}
          activeProjectId="proj-1"
          onProjectSelect={vi.fn()}
          onToggleArchivedView={vi.fn()}
          archivedViewOpen={true}
          archivedIsLoading={true}
        />,
      )
      await flush()
    })
    const list = container.querySelector('[data-testid="rail-archived-list"]')
    expect(list?.querySelectorAll('[data-testid="rail-skeleton"]').length).toBeGreaterThan(0)
  })

  it('renders archived error block when archivedIsError is true', async () => {
    await act(async () => {
      root.render(
        <ProjectSwitcherRail
          projects={[{ id: 'proj-1', name: 'Alpha' }]}
          activeProjectId="proj-1"
          onProjectSelect={vi.fn()}
          onToggleArchivedView={vi.fn()}
          archivedViewOpen={true}
          archivedIsError={true}
        />,
      )
      await flush()
    })
    expect(container.querySelector('[data-testid="rail-archived-error"]')).toBeTruthy()
  })
})
