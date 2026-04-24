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
    projects: [
      { id: 'proj-1', name: 'Alpha' },
      { id: 'proj-2', name: 'Archived', archived: true },
    ],
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

function dispatchContextMenu(target: Element) {
  const ev = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: 50,
    clientY: 50,
  })
  target.dispatchEvent(ev)
}

describe('Phase 1.3 — ProjectSwitcherRail context menu (Goals C6, INV-5)', () => {
  it('right-click on active project avatar opens menu with Archive', async () => {
    const onArchive = vi.fn()
    await renderRail({ onArchiveProject: onArchive })
    const avatar = container.querySelector('[data-project-id="proj-1"]') as HTMLButtonElement

    await act(async () => {
      dispatchContextMenu(avatar)
      await flush()
    })

    const archiveBtn = document.querySelector('[data-testid="rail-menu-archive"]') as HTMLButtonElement
    expect(archiveBtn).toBeTruthy()
    await act(async () => {
      archiveBtn.click()
      await flush()
    })
    expect(onArchive).toHaveBeenCalledWith('proj-1')
  })

  it('right-click on archived project avatar opens menu with Unarchive', async () => {
    const onUnarchive = vi.fn()
    await renderRail({
      onArchiveProject: vi.fn(),
      onUnarchiveProject: onUnarchive,
      archivedViewOpen: true,
      onToggleArchivedView: vi.fn(),
    })
    const avatar = container.querySelector('[data-project-id="proj-2"]') as HTMLButtonElement
    expect(avatar).toBeTruthy()

    await act(async () => {
      dispatchContextMenu(avatar)
      await flush()
    })

    const unarchiveBtn = document.querySelector('[data-testid="rail-menu-unarchive"]') as HTMLButtonElement
    expect(unarchiveBtn).toBeTruthy()
    await act(async () => {
      unarchiveBtn.click()
      await flush()
    })
    expect(onUnarchive).toHaveBeenCalledWith('proj-2')
  })

  it('Escape key closes the context menu', async () => {
    await renderRail({ onArchiveProject: vi.fn() })
    const avatar = container.querySelector('[data-project-id="proj-1"]') as HTMLButtonElement

    await act(async () => {
      dispatchContextMenu(avatar)
      await flush()
    })
    expect(document.querySelector('[data-testid="rail-context-menu"]')).toBeTruthy()

    await act(async () => {
      const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      document.dispatchEvent(ev)
      await flush()
    })
    expect(document.querySelector('[data-testid="rail-context-menu"]')).toBeNull()
  })

  it('click-outside closes the context menu', async () => {
    await renderRail({ onArchiveProject: vi.fn() })
    const avatar = container.querySelector('[data-project-id="proj-1"]') as HTMLButtonElement

    await act(async () => {
      dispatchContextMenu(avatar)
      await flush()
    })
    expect(document.querySelector('[data-testid="rail-context-menu"]')).toBeTruthy()

    await act(async () => {
      const ev = new MouseEvent('mousedown', { bubbles: true })
      document.body.dispatchEvent(ev)
      await flush()
    })
    expect(document.querySelector('[data-testid="rail-context-menu"]')).toBeNull()
  })

  it('surfaces archiveErrorMessage prop as an inline status strip (INV-5 FORBIDDEN surface)', async () => {
    await renderRail({
      onArchiveProject: vi.fn(),
      archiveErrorMessage: 'archive_project is blocked while the project is hard stopped.',
    })
    const strip = container.querySelector('[data-testid="rail-archive-error"]')
    expect(strip?.textContent).toContain('hard stopped')
  })

  it('does not open a menu when no onArchiveProject or onUnarchiveProject is wired', async () => {
    await renderRail({ onArchiveProject: undefined, onUnarchiveProject: undefined })
    const avatar = container.querySelector('[data-project-id="proj-1"]') as HTMLButtonElement

    await act(async () => {
      dispatchContextMenu(avatar)
      await flush()
    })
    expect(document.querySelector('[data-testid="rail-context-menu"]')).toBeNull()
  })
})
