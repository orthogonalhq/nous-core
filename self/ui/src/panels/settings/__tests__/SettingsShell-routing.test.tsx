// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsShell } from '../SettingsShell'
import type { SettingsShellProps } from '../types'

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

function makeApi() {
  return {
    getApiKeys: vi.fn().mockResolvedValue([]),
    setApiKey: vi.fn().mockResolvedValue({ stored: true }),
    deleteApiKey: vi.fn().mockResolvedValue({ deleted: true }),
    testApiKey: vi.fn().mockResolvedValue({ valid: true, error: null }),
    getSystemStatus: vi.fn().mockResolvedValue({
      ollama: { running: false, models: [] },
      configuredProviders: [],
      credentialVaultHealthy: true,
    }),
    resetWizard: vi.fn().mockResolvedValue(undefined),
    getAvailableModels: vi.fn().mockResolvedValue({ models: [] }),
    getRoleAssignments: vi.fn().mockResolvedValue([]),
    getHardwareRecommendations: vi.fn().mockResolvedValue({
      singleModel: null,
      multiModel: [],
      advisory: '',
    }),
    setRoleAssignment: vi.fn().mockResolvedValue({ success: true }),
    listOllamaModels: vi.fn().mockResolvedValue({ models: [] }),
    pullOllamaModel: vi.fn().mockResolvedValue({ success: true }),
    deleteOllamaModel: vi.fn().mockResolvedValue({ success: true }),
  }
}

async function renderShell(
  overrides: Partial<SettingsShellProps> = {},
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

describe('SettingsShell page routing', () => {
  it('renders page content area with data-testid="settings-page-content"', async () => {
    await renderShell({ api: makeApi() })

    const content = container.querySelector('[data-testid="settings-page-content"]')
    expect(content).not.toBeNull()

    // Placeholder should be gone
    const placeholder = container.querySelector('[data-testid="settings-page-placeholder"]')
    expect(placeholder).toBeNull()
  })

  it('default page (shell-mode) renders ShellModePage on mount', async () => {
    await renderShell({ api: makeApi() })

    const page = container.querySelector('[data-testid="settings-page-shell-mode"]')
    expect(page).not.toBeNull()
  })

  it('clicking nav item renders corresponding page component', async () => {
    await renderShell({ api: makeApi() })

    // Click on API Keys
    const apiKeysButton = container.querySelector('[data-testid="page-api-keys"]')
    expect(apiKeysButton).not.toBeNull()

    await act(async () => {
      apiKeysButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    const apiKeysPage = container.querySelector('[data-testid="settings-page-api-keys"]')
    expect(apiKeysPage).not.toBeNull()
  })

  it('clicking About nav item renders AboutPage', async () => {
    await renderShell({ api: makeApi() })

    const aboutButton = container.querySelector('[data-testid="page-about"]')
    await act(async () => {
      aboutButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    const aboutPage = container.querySelector('[data-testid="settings-page-about"]')
    expect(aboutPage).not.toBeNull()
  })

  it('clicking System Status nav item renders SystemStatusPage', async () => {
    await renderShell({ api: makeApi() })

    const button = container.querySelector('[data-testid="page-system-status"]')
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    const page = container.querySelector('[data-testid="settings-page-system-status"]')
    expect(page).not.toBeNull()
  })

  it('clicking Local Models nav item renders LocalModelsPage', async () => {
    const api = makeApi()
    api.listOllamaModels = vi.fn().mockResolvedValue({ models: [] })
    api.pullOllamaModel = vi.fn().mockResolvedValue({ success: true })
    api.deleteOllamaModel = vi.fn().mockResolvedValue({ success: true })

    await renderShell({ api })

    const button = container.querySelector('[data-testid="page-local-models"]')
    expect(button).not.toBeNull()

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    const page = container.querySelector('[data-testid="settings-page-local-models"]')
    expect(page).not.toBeNull()
  })

  it('clicking Setup Wizard nav item renders SetupWizardPage', async () => {
    await renderShell({ api: makeApi() })

    const button = container.querySelector('[data-testid="page-setup-wizard"]')
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    const page = container.querySelector('[data-testid="settings-page-setup-wizard"]')
    expect(page).not.toBeNull()
  })

  it('shell without api prop renders "not connected" fallback for API pages', async () => {
    await renderShell()

    // Navigate to API Keys (requires api)
    const apiKeysButton = container.querySelector('[data-testid="page-api-keys"]')
    await act(async () => {
      apiKeysButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(container.textContent).toContain('Settings API not connected')
  })

  it('shell without api still renders ShellModePage and AboutPage', async () => {
    await renderShell()

    // Default page is shell-mode, should render
    const shellModePage = container.querySelector('[data-testid="settings-page-shell-mode"]')
    expect(shellModePage).not.toBeNull()

    // Navigate to About
    const aboutButton = container.querySelector('[data-testid="page-about"]')
    await act(async () => {
      aboutButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })

    const aboutPage = container.querySelector('[data-testid="settings-page-about"]')
    expect(aboutPage).not.toBeNull()
  })

  it('unknown page ID renders "page not found" fallback', async () => {
    await renderShell({ api: makeApi(), defaultPageId: 'nonexistent-page' })

    expect(container.textContent).toContain('Page not found')
    expect(container.textContent).toContain('nonexistent-page')
  })

  it('currentMode and onModeChange props thread to ShellModePage', async () => {
    const onModeChange = vi.fn()
    await renderShell({
      api: makeApi(),
      currentMode: 'developer',
      onModeChange,
    })

    const checkbox = container.querySelector<HTMLInputElement>('#developer-mode-toggle')
    expect(checkbox).not.toBeNull()
    expect(checkbox!.checked).toBe(true)

    await act(async () => {
      checkbox!.click()
      await flush()
    })

    expect(onModeChange).toHaveBeenCalledWith('simple')
  })

  it('onWizardReset prop threads to SetupWizardPage', async () => {
    const onWizardReset = vi.fn()

    await renderShell({
      api: makeApi(),
      onWizardReset,
      defaultPageId: 'setup-wizard',
    })

    // Click the button to open ConfirmDeleteDialog
    const button = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Re-run Setup Wizard',
    )!
    await act(async () => {
      button.click()
      await flush()
    })

    // Type the confirm word and submit via ConfirmDeleteDialog
    const input = document.querySelector('[data-testid="confirm-delete-input"]') as HTMLInputElement
    await act(async () => {
      input.focus()
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'value',
      )!.set!.call(input, 'RESET')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await flush()
    })

    const submitBtn = document.querySelector('[data-testid="confirm-delete-submit"]') as HTMLButtonElement
    await act(async () => {
      submitBtn.click()
      await flush()
    })

    expect(onWizardReset).toHaveBeenCalled()
  })

  it('app settings context renders AppSettingsPage for dynamic app panel', async () => {
    const appSettingsContext = {
      telegram: {
        preparation: {
          project_id: 'proj-1',
          package_id: 'pkg-1',
          release_id: 'rel-1',
          package_version: '1.0.0',
          app_id: 'telegram',
          display_name: 'Telegram',
          config_version: '1',
          runtime: { status: 'running', config_version: '1' },
          config_groups: [],
          panel_config_snapshot: {},
        } as never,
        actorId: 'test-actor',
        onSave: vi.fn().mockResolvedValue({
          status: 'success',
          runtime: { status: 'running', config_version: '1' },
          stored_secrets: [],
          witness_refs: [],
          rollback_applied: false,
          recoverable: true,
          metadata: {},
        }),
      },
    }

    await renderShell({
      api: makeApi(),
      appPanels: [{ id: 'telegram', title: 'Telegram' }],
      appSettingsContext,
      defaultPageId: 'telegram',
    })

    const page = container.querySelector('[data-testid="settings-page-app-settings"]')
    expect(page).not.toBeNull()
  })
})
