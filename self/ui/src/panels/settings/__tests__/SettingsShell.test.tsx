// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsShell } from '../SettingsShell'

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

async function renderShell(
  overrides: Partial<React.ComponentProps<typeof SettingsShell>> = {},
) {
  await act(async () => {
    root.render(
      <SettingsShell
        {...overrides}
      />,
    )
    await flush()
  })
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
  vi.restoreAllMocks()
})

describe('SettingsShell', () => {
  it('renders sidebar nav region and content area region', async () => {
    await renderShell()

    const navColumn = container.querySelector('[data-testid="settings-nav-column"]')
    const contentArea = container.querySelector('[data-testid="settings-content"]')

    expect(navColumn).not.toBeNull()
    expect(contentArea).not.toBeNull()
  })

  it('content area renders page content for the default page', async () => {
    await renderShell()

    const pageContent = container.querySelector('[data-testid="settings-page-content"]')
    expect(pageContent).not.toBeNull()
    // Default page is shell-mode, should render the ShellModePage
    const shellModePage = container.querySelector('[data-testid="settings-page-shell-mode"]')
    expect(shellModePage).not.toBeNull()
  })

  it('page state updates when nav item is clicked', async () => {
    await renderShell()

    // Click on "About" page (does not require api)
    const aboutButton = container.querySelector('[data-testid="page-about"]')
    expect(aboutButton).not.toBeNull()

    await act(async () => {
      aboutButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    const aboutPage = container.querySelector('[data-testid="settings-page-about"]')
    expect(aboutPage).not.toBeNull()
  })

  it('accepts defaultPageId prop and initializes to it', async () => {
    await renderShell({ defaultPageId: 'about' })

    const aboutPage = container.querySelector('[data-testid="settings-page-about"]')
    expect(aboutPage).not.toBeNull()
  })

  it('renders without optional api prop', async () => {
    // Should not throw when api is undefined
    await renderShell()

    const shell = container.querySelector('[data-testid="settings-shell"]')
    expect(shell).not.toBeNull()
  })

  it('SettingsShell with no defaultPageId defaults to first page', async () => {
    await renderShell()

    // First page is shell-mode
    const shellModePage = container.querySelector('[data-testid="settings-page-shell-mode"]')
    expect(shellModePage).not.toBeNull()
  })

  it('renders dynamic app entries from appPanels', async () => {
    await renderShell({
      appPanels: [
        { id: 'telegram', title: 'Telegram' },
        { id: 'discord', title: 'Discord' },
      ],
    })

    expect(container.textContent).toContain('Telegram')
    expect(container.textContent).toContain('Discord')
  })
})
