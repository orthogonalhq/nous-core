// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsNav } from '../SettingsNav'
import type { SettingsCategory } from '../types'

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

const defaultCategories: SettingsCategory[] = [
  {
    id: 'general',
    label: 'General',
    icon: null,
    defaultExpanded: true,
    children: [
      { id: 'shell-mode', label: 'Shell Mode' },
      { id: 'about', label: 'About' },
    ],
  },
  {
    id: 'ai-configuration',
    label: 'AI Configuration',
    icon: null,
    defaultExpanded: true,
    children: [
      { id: 'api-keys', label: 'API Keys' },
      { id: 'model-config', label: 'Model Config' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    icon: null,
    defaultExpanded: true,
    children: [
      { id: 'system-status', label: 'System Status' },
      { id: 'setup-wizard', label: 'Setup Wizard' },
      { id: 'local-models', label: 'Local Models' },
    ],
  },
  {
    id: 'nous-apps',
    label: 'Nous Apps',
    icon: null,
    defaultExpanded: true,
    children: [],
  },
]

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

async function renderNav(
  overrides: Partial<React.ComponentProps<typeof SettingsNav>> = {},
) {
  await act(async () => {
    root.render(
      <SettingsNav
        categories={defaultCategories}
        activePageId="shell-mode"
        onPageSelect={() => undefined}
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

describe('SettingsNav', () => {
  it('renders all 4 default category groups', async () => {
    await renderNav()

    expect(container.textContent).toContain('General')
    expect(container.textContent).toContain('AI Configuration')
    expect(container.textContent).toContain('System')
    expect(container.textContent).toContain('Nous Apps')
  })

  it('renders page items within expanded categories', async () => {
    await renderNav()

    expect(container.textContent).toContain('Shell Mode')
    expect(container.textContent).toContain('About')
    expect(container.textContent).toContain('API Keys')
    expect(container.textContent).toContain('Model Config')
    expect(container.textContent).toContain('System Status')
    expect(container.textContent).toContain('Setup Wizard')
    expect(container.textContent).toContain('Local Models')
  })

  it('calls onPageSelect callback when page item is clicked', async () => {
    const onPageSelect = vi.fn()

    await renderNav({ onPageSelect })

    const apiKeysButton = container.querySelector('[data-testid="page-api-keys"]')
    expect(apiKeysButton).not.toBeNull()

    await act(async () => {
      apiKeysButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(onPageSelect).toHaveBeenCalledWith('api-keys')
  })

  it('highlights the active page item', async () => {
    await renderNav({ activePageId: 'api-keys' })

    const activeButton = container.querySelector('[data-testid="page-api-keys"]')
    expect(activeButton).not.toBeNull()
    expect(activeButton!.getAttribute('data-active')).toBe('true')

    const inactiveButton = container.querySelector('[data-testid="page-shell-mode"]')
    expect(inactiveButton).not.toBeNull()
    expect(inactiveButton!.getAttribute('data-active')).toBeNull()
  })

  it('category collapse hides child items', async () => {
    await renderNav()

    // Verify General children are visible initially
    expect(container.textContent).toContain('Shell Mode')

    // Click the General category header to collapse
    const generalHeader = container.querySelector('[data-testid="category-general"]')
    expect(generalHeader).not.toBeNull()

    await act(async () => {
      generalHeader!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    // Children should no longer be visible
    expect(container.textContent).not.toContain('Shell Mode')
    expect(container.textContent).not.toContain('About')

    // Other categories should still be visible
    expect(container.textContent).toContain('API Keys')
  })

  it('dynamic app entries from appPanels appear in Nous Apps category', async () => {
    const categoriesWithApps: SettingsCategory[] = [
      ...defaultCategories.slice(0, 3),
      {
        id: 'nous-apps',
        label: 'Nous Apps',
        icon: null,
        defaultExpanded: true,
        children: [
          { id: 'telegram', label: 'Telegram' },
          { id: 'discord', label: 'Discord' },
        ],
      },
    ]

    await renderNav({ categories: categoriesWithApps })

    expect(container.textContent).toContain('Telegram')
    expect(container.textContent).toContain('Discord')
  })

  it('empty appPanels renders Nous Apps category with no children', async () => {
    await renderNav()

    expect(container.textContent).toContain('Nous Apps')
    // The category header is present but no page items under it
    const nousAppsCategory = container.querySelector('[data-testid="category-nous-apps"]')
    expect(nousAppsCategory).not.toBeNull()
  })
})
