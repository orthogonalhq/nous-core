// @vitest-environment jsdom

import { fireEvent } from '@testing-library/react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PreferencesPanel, type PreferencesApi } from '../PreferencesPanel.js'

import { ModelRoleSchema, MODEL_ROLE_LABELS } from '@nous/shared'

const ROLE_LABELS = ModelRoleSchema.options.map((r) => MODEL_ROLE_LABELS[r])
const ROLE_KEYS = ModelRoleSchema.options

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function createBaseApi(overrides: Partial<PreferencesApi> = {}): PreferencesApi {
  return {
    getApiKeys: async () => [],
    setApiKey: async () => ({ stored: true }),
    deleteApiKey: async () => ({ deleted: true }),
    testApiKey: async () => ({ valid: true, error: null }),
    getSystemStatus: async () => ({
      ollama: { running: true, models: ['qwen2.5:7b'] },
      configuredProviders: ['anthropic'],
      credentialVaultHealthy: true,
    }),
    getAvailableModels: async () => ({
      models: [
        { id: 'ollama:qwen2.5:7b', name: 'Qwen 2.5 7B', provider: 'ollama', available: true },
        { id: 'anthropic:claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', available: true },
        { id: 'openai:gpt-4o', name: 'GPT-4o', provider: 'openai', available: true },
      ],
    }),
    ...overrides,
  }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

async function renderPanel(
  api: PreferencesApi,
  paramsOverrides: Record<string, unknown> = {},
): Promise<void> {
  await act(async () => {
    root.render(
      <PreferencesPanel
        api={{} as any}
        containerApi={{} as any}
        params={{ preferencesApi: api, ...paramsOverrides } as any}
      />,
    )
    await flush()
  })
}

function textContent(): string {
  return container.textContent ?? ''
}

function getButton(label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`)
  }

  return button
}

function getSwitchByAriaLabel(label: string): HTMLInputElement {
  const input = container.querySelector(`input[aria-label="${label}"]`)

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Switch not found: ${label}`)
  }

  return input
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
  })
}

async function toggleSwitch(input: HTMLInputElement, checked: boolean): Promise<void> {
  if (input.checked === checked) {
    return
  }

  await act(async () => {
    fireEvent.click(input)
    await flush()
  })
}

async function navigateToPage(pageId: string): Promise<void> {
  const navButton = container.querySelector(`[data-testid="page-${pageId}"]`)
  if (!(navButton instanceof HTMLButtonElement)) {
    throw new Error(`Nav button not found for page: ${pageId}`)
  }
  await act(async () => {
    fireEvent.click(navButton)
    await flush()
  })
  // Extra flush to allow page component to mount and load data
  await act(async () => {
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

describe('PreferencesPanel renders SettingsShell', () => {
  it('renders the settings shell structure', async () => {
    const api = createBaseApi()
    await renderPanel(api)

    expect(container.querySelector('[data-testid="settings-shell"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="settings-nav-column"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="settings-content"]')).toBeTruthy()
  })

  it('renders navigation categories', async () => {
    const api = createBaseApi()
    await renderPanel(api)

    expect(textContent()).toContain('General')
    expect(textContent()).toContain('AI Configuration')
    expect(textContent()).toContain('System')
  })
})

describe('PreferencesPanel model configuration settings', () => {
  it('renders model config page with all 4 role labels', async () => {
    const api = createBaseApi({
      getRoleAssignments: async () =>
        ROLE_KEYS.map((role) => ({ role, providerId: null })) as any,
      setRoleAssignment: async () => ({ success: true }),
    })

    await renderPanel(api)
    await navigateToPage('model-config')

    for (const label of ROLE_LABELS) {
      expect(textContent()).toContain(label)
    }
  })

  it('renders without role assignment methods for backwards compatibility', async () => {
    const api = createBaseApi()

    await renderPanel(api)
    await navigateToPage('model-config')

    // ModelConfigPage renders when getAvailableModels is defined
    const pageContent = container.querySelector('[data-testid="settings-page-model-config"]')
    expect(pageContent).toBeTruthy()
  })
})

describe('PreferencesPanel setup wizard', () => {
  it('renders the re-run wizard control and calls reset + callback', async () => {
    const resetWizard = vi.fn(async () => ({ complete: false }))
    const onWizardReset = vi.fn()

    const api = createBaseApi({
      resetWizard,
      getRoleAssignments: async () =>
        ROLE_KEYS.map((role) => ({ role, providerId: null })) as any,
      setRoleAssignment: async () => ({ success: true }),
    })

    await renderPanel(api, { onWizardReset })
    await navigateToPage('setup-wizard')
    await click(getButton('Re-run Setup Wizard'))

    // ConfirmDeleteDialog should be open — type RESET and submit
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

    expect(resetWizard).toHaveBeenCalledTimes(1)
    expect(onWizardReset).toHaveBeenCalledTimes(1)
  })
})

describe('PreferencesPanel developer mode toggle', () => {
  it('renders the developer mode toggle when mode params are provided', async () => {
    const api = createBaseApi()

    await renderPanel(api, {
      currentMode: 'developer',
      onModeChange: vi.fn(),
    })

    // Shell mode is the default page, no navigation needed
    const toggle = getSwitchByAriaLabel('Developer Mode')

    expect(textContent()).toContain('Developer Mode')
    expect(toggle.checked).toBe(true)
  })

  it('calls onModeChange with the next mode when the toggle changes', async () => {
    const onModeChange = vi.fn()
    const api = createBaseApi()

    await renderPanel(api, {
      currentMode: 'simple',
      onModeChange,
    })

    await toggleSwitch(getSwitchByAriaLabel('Developer Mode'), true)

    expect(onModeChange).toHaveBeenCalledWith('developer')
  })

  it('reflects the current mode in the developer mode toggle state', async () => {
    const api = createBaseApi()

    await renderPanel(api, {
      currentMode: 'simple',
      onModeChange: vi.fn(),
    })
    expect(getSwitchByAriaLabel('Developer Mode').checked).toBe(false)

    await renderPanel(api, {
      currentMode: 'developer',
      onModeChange: vi.fn(),
    })
    expect(getSwitchByAriaLabel('Developer Mode').checked).toBe(true)
  })
})
