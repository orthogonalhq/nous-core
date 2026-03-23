import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { DockviewApi } from 'dockview-react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElectronAPIMock } from '../../test-setup'
import { AppMenuBar } from '../MenuBar'
import type { PanelDef } from '../../App'

const PANEL_DEFS: PanelDef[] = [
  {
    id: 'chat',
    component: 'chat',
    title: 'Project Chat',
  },
  {
    id: 'preferences',
    component: 'preferences',
    title: 'Preferences',
  },
]

function createDockviewApi(openPanelIds: string[] = []): DockviewApi {
  const panels = openPanelIds.map((id) => ({ id }))

  return {
    panels,
    getPanel: vi.fn((id: string) => panels.find((panel) => panel.id === id) ?? null),
    addPanel: vi.fn(),
    removePanel: vi.fn(),
    onDidAddPanel: vi.fn(() => ({ dispose: vi.fn() })),
    onDidRemovePanel: vi.fn(() => ({ dispose: vi.fn() })),
  } as unknown as DockviewApi
}

async function openViewMenu() {
  const trigger = screen.getByText('View')
  fireEvent.pointerDown(trigger)
  fireEvent.click(trigger)

  await waitFor(() => {
    expect(screen.getByText('Panels')).toBeInTheDocument()
  })
}

describe('AppMenuBar', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: createElectronAPIMock(),
    })
  })

  it('shows simple-mode view actions instead of dockview panel toggles', async () => {
    render(
      <AppMenuBar
        dockviewApi={createDockviewApi(['chat'])}
        panelDefs={PANEL_DEFS}
        mode="simple"
        onModeToggle={vi.fn()}
      />,
    )

    await openViewMenu()

    expect(screen.getByText('Toggle Chat Panel')).toBeInTheDocument()
    expect(screen.getByText('Toggle Observe Panel')).toBeInTheDocument()
    expect(screen.queryByText('Project Chat')).not.toBeInTheDocument()
    expect(screen.queryByText('Preferences')).not.toBeInTheDocument()
  })

  it('shows dockview panel toggles in developer mode', async () => {
    render(
      <AppMenuBar
        dockviewApi={createDockviewApi(['chat'])}
        panelDefs={PANEL_DEFS}
        mode="developer"
        onModeToggle={vi.fn()}
      />,
    )

    await openViewMenu()

    expect(screen.getByText('Project Chat')).toBeInTheDocument()
    expect(screen.getByText('Preferences')).toBeInTheDocument()
    expect(screen.queryByText('Toggle Chat Panel')).not.toBeInTheDocument()
  })

  it('shows mode toggle and disabled command palette in both modes', async () => {
    const { rerender } = render(
      <AppMenuBar
        dockviewApi={createDockviewApi(['chat'])}
        panelDefs={PANEL_DEFS}
        mode="simple"
        onModeToggle={vi.fn()}
      />,
    )

    await openViewMenu()

    expect(screen.getByText('Toggle Developer Mode')).toBeInTheDocument()
    expect(screen.getByText('Ctrl+Shift+D')).toBeInTheDocument()
    expect(screen.getByText('Ctrl+K')).toBeInTheDocument()
    expect(screen.getByText('Command Palette')).toHaveAttribute('data-disabled')

    rerender(
      <AppMenuBar
        dockviewApi={createDockviewApi(['chat'])}
        panelDefs={PANEL_DEFS}
        mode="developer"
        onModeToggle={vi.fn()}
      />,
    )

    await openViewMenu()

    expect(screen.getByText('Toggle Developer Mode')).toBeInTheDocument()
    expect(screen.getByText('Command Palette')).toHaveAttribute('data-disabled')
  })

  it('calls onModeToggle when the developer mode item is selected', async () => {
    const onModeToggle = vi.fn()

    render(
      <AppMenuBar
        dockviewApi={createDockviewApi(['chat'])}
        panelDefs={PANEL_DEFS}
        mode="simple"
        onModeToggle={onModeToggle}
      />,
    )

    await openViewMenu()

    fireEvent.click(screen.getByText('Toggle Developer Mode'))

    expect(onModeToggle).toHaveBeenCalledTimes(1)
  })
})
