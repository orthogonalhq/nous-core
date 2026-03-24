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

  it('placeholder content area shows selected page ID', async () => {
    await renderShell()

    const placeholder = container.querySelector('[data-testid="settings-page-placeholder"]')
    expect(placeholder).not.toBeNull()
    // Default page is the first page (shell-mode)
    expect(placeholder!.textContent).toBe('shell-mode')
  })

  it('page state updates when nav item is clicked', async () => {
    await renderShell()

    // Click on "API Keys" page
    const apiKeysButton = container.querySelector('[data-testid="page-api-keys"]')
    expect(apiKeysButton).not.toBeNull()

    await act(async () => {
      apiKeysButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    const placeholder = container.querySelector('[data-testid="settings-page-placeholder"]')
    expect(placeholder!.textContent).toBe('api-keys')
  })

  it('accepts defaultPageId prop and initializes to it', async () => {
    await renderShell({ defaultPageId: 'system-status' })

    const placeholder = container.querySelector('[data-testid="settings-page-placeholder"]')
    expect(placeholder!.textContent).toBe('system-status')
  })

  it('renders without optional api prop', async () => {
    // Should not throw when api is undefined
    await renderShell()

    const shell = container.querySelector('[data-testid="settings-shell"]')
    expect(shell).not.toBeNull()
  })

  it('SettingsShell with no defaultPageId defaults to first page', async () => {
    await renderShell()

    const placeholder = container.querySelector('[data-testid="settings-page-placeholder"]')
    expect(placeholder!.textContent).toBe('shell-mode')
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
