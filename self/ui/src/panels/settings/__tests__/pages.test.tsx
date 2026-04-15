// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AboutPage } from '../pages/AboutPage'
import { ShellModePage } from '../pages/ShellModePage'
import { SystemStatusPage } from '../pages/SystemStatusPage'
import { ApiKeysPage } from '../pages/ApiKeysPage'
import { ModelConfigPage } from '../pages/ModelConfigPage'
import { SetupWizardPage } from '../pages/SetupWizardPage'

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
  vi.restoreAllMocks()
})

// ─── AboutPage ───────────────────────────────────────────────────────────────

describe('AboutPage', () => {
  it('renders with data-testid and contains Nous text', async () => {
    await act(async () => {
      root.render(<AboutPage />)
      await flush()
    })

    const el = container.querySelector('[data-testid="settings-page-about"]')
    expect(el).not.toBeNull()
    expect(container.textContent).toContain('Nous')
    expect(container.textContent).toContain('v0.1.0')
  })

  it('contains GitHub and Documentation links', async () => {
    await act(async () => {
      root.render(<AboutPage />)
      await flush()
    })

    const links = container.querySelectorAll('a')
    const hrefs = Array.from(links).map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('https://github.com/nousai/nous-core')
    expect(hrefs).toContain('https://docs.nous.ai')
  })
})

// ─── ShellModePage ───────────────────────────────────────────────────────────

describe('ShellModePage', () => {
  it('renders with data-testid and checkbox reflects currentMode', async () => {
    await act(async () => {
      root.render(<ShellModePage currentMode="developer" />)
      await flush()
    })

    const el = container.querySelector('[data-testid="settings-page-shell-mode"]')
    expect(el).not.toBeNull()

    const checkbox = container.querySelector<HTMLInputElement>('#developer-mode-toggle')
    expect(checkbox).not.toBeNull()
    expect(checkbox!.checked).toBe(true)
  })

  it('checkbox is unchecked for simple mode', async () => {
    await act(async () => {
      root.render(<ShellModePage currentMode="simple" />)
      await flush()
    })

    const checkbox = container.querySelector<HTMLInputElement>('#developer-mode-toggle')
    expect(checkbox!.checked).toBe(false)
  })

  it('onModeChange callback fires on toggle', async () => {
    const onModeChange = vi.fn()
    await act(async () => {
      root.render(<ShellModePage currentMode="simple" onModeChange={onModeChange} />)
      await flush()
    })

    const checkbox = container.querySelector<HTMLInputElement>('#developer-mode-toggle')
    await act(async () => {
      checkbox!.click()
      await flush()
    })

    expect(onModeChange).toHaveBeenCalledWith('developer')
  })
})

// ─── SystemStatusPage ────────────────────────────────────────────────────────

describe('SystemStatusPage', () => {
  it('renders after api.getSystemStatus resolves', async () => {
    const api = {
      getSystemStatus: vi.fn().mockResolvedValue({
        ollama: { running: true, models: ['llama3'] },
        configuredProviders: ['anthropic'],
        credentialVaultHealthy: true,
      }),
    }

    await act(async () => {
      root.render(<SystemStatusPage api={api} />)
      await flush()
    })

    const el = container.querySelector('[data-testid="settings-page-system-status"]')
    expect(el).not.toBeNull()
    expect(container.textContent).toContain('Running')
    expect(container.textContent).toContain('Anthropic')
    expect(container.textContent).toContain('Healthy')
  })

  it('shows Not running when Ollama is down', async () => {
    const api = {
      getSystemStatus: vi.fn().mockResolvedValue({
        ollama: { running: false, models: [] },
        configuredProviders: [],
        credentialVaultHealthy: false,
      }),
    }

    await act(async () => {
      root.render(<SystemStatusPage api={api} />)
      await flush()
    })

    expect(container.textContent).toContain('Not running')
    expect(container.textContent).toContain('Unavailable')
  })
})

// ─── ApiKeysPage ─────────────────────────────────────────────────────────────

describe('ApiKeysPage', () => {
  const makeApi = () => ({
    getApiKeys: vi.fn().mockResolvedValue([
      { provider: 'anthropic' as const, configured: true, maskedKey: 'sk-***abc', createdAt: '2026-01-01' },
      { provider: 'openai' as const, configured: false, maskedKey: null, createdAt: null },
    ]),
    setApiKey: vi.fn().mockResolvedValue({ stored: true }),
    deleteApiKey: vi.fn().mockResolvedValue({ deleted: true }),
    testApiKey: vi.fn().mockResolvedValue({ valid: true, error: null }),
  })

  it('renders key list after api.getApiKeys resolves', async () => {
    const api = makeApi()
    await act(async () => {
      root.render(<ApiKeysPage api={api} />)
      await flush()
    })

    const el = container.querySelector('[data-testid="settings-page-api-keys"]')
    expect(el).not.toBeNull()
    expect(container.textContent).toContain('Anthropic')
    expect(container.textContent).toContain('Configured')
    expect(container.textContent).toContain('sk-***abc')
  })

  it('save-and-test flow calls testApiKey then setApiKey', async () => {
    const api = makeApi()
    await act(async () => {
      root.render(<ApiKeysPage api={api} />)
      await flush()
    })

    // Type a key
    const input = container.querySelector<HTMLInputElement>('input[type="password"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'sk-test-key')
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await flush()
    })

    // Click save & test
    const saveButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Save & Test',
    )!
    await act(async () => {
      saveButton.click()
      await flush()
    })

    expect(api.testApiKey).toHaveBeenCalled()
    expect(api.setApiKey).toHaveBeenCalled()
  })

  it('delete calls api.deleteApiKey', async () => {
    const api = makeApi()
    await act(async () => {
      root.render(<ApiKeysPage api={api} />)
      await flush()
    })

    const deleteButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Delete',
    )!
    await act(async () => {
      deleteButton.click()
      await flush()
    })

    expect(api.deleteApiKey).toHaveBeenCalledWith({ provider: 'anthropic' })
  })

  it('shows error feedback when test reports invalid key', async () => {
    const api = makeApi()
    api.testApiKey.mockResolvedValue({ valid: false, error: 'Invalid API key' })

    await act(async () => {
      root.render(<ApiKeysPage api={api} />)
      await flush()
    })

    const input = container.querySelector<HTMLInputElement>('input[type="password"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'bad-key')
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await flush()
    })

    const saveButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Save & Test',
    )!
    await act(async () => {
      saveButton.click()
      await flush()
    })

    expect(container.textContent).toContain('Invalid key')
  })
})

// ─── ModelConfigPage ─────────────────────────────────────────────────────────

describe('ModelConfigPage', () => {
  const makeApi = () => ({
    getAvailableModels: vi.fn().mockResolvedValue({
      models: [
        { id: 'claude-3', name: 'Claude 3', provider: 'anthropic', available: true },
        { id: 'gpt-4', name: 'GPT-4', provider: 'openai', available: true },
      ],
    }),
    getRoleAssignments: vi.fn().mockResolvedValue([]),
    setRoleAssignment: vi.fn().mockResolvedValue({ success: true }),
  })

  it('renders all 4 role slot labels after data loads', async () => {
    const api = makeApi()
    await act(async () => {
      root.render(<ModelConfigPage api={api} />)
      await flush()
    })

    const el = container.querySelector('[data-testid="settings-page-model-config"]')
    expect(el).not.toBeNull()
    expect(container.textContent).toContain('Cortex Chat')
    expect(container.textContent).toContain('Cortex System')
    expect(container.textContent).toContain('Agent Orchitect Orchestrator')
    expect(container.textContent).toContain('Agent Worker')
  })

  it('renders exactly 4 role select elements', async () => {
    const api = makeApi()
    await act(async () => {
      root.render(<ModelConfigPage api={api} />)
      await flush()
    })

    const selects = container.querySelectorAll('select')
    expect(selects).toHaveLength(4)
  })

  it('save button calls api.setRoleAssignment for cortex-chat', async () => {
    const api = makeApi()
    await act(async () => {
      root.render(<ModelConfigPage api={api} />)
      await flush()
    })

    // Select a model for cortex-chat
    const select = container.querySelector<HTMLSelectElement>('#role-select-cortex-chat')!
    await act(async () => {
      select.value = 'claude-3'
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await flush()
    })

    // Click save
    const saveButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Save',
    )!
    await act(async () => {
      saveButton.click()
      await flush()
    })

    expect(api.setRoleAssignment).toHaveBeenCalledWith({
      role: 'cortex-chat',
      modelSpec: 'claude-3',
    })
  })

  it('save button calls api.setRoleAssignment for orchestrators', async () => {
    const api = makeApi()
    await act(async () => {
      root.render(<ModelConfigPage api={api} />)
      await flush()
    })

    const select = container.querySelector<HTMLSelectElement>('#role-select-orchestrators')!
    await act(async () => {
      select.value = 'gpt-4'
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await flush()
    })

    const saveButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Save',
    )!
    await act(async () => {
      saveButton.click()
      await flush()
    })

    expect(api.setRoleAssignment).toHaveBeenCalledWith({
      role: 'orchestrators',
      modelSpec: 'gpt-4',
    })
  })

  it('save button calls api.setRoleAssignment for workers', async () => {
    const api = makeApi()
    await act(async () => {
      root.render(<ModelConfigPage api={api} />)
      await flush()
    })

    const select = container.querySelector<HTMLSelectElement>('#role-select-workers')!
    await act(async () => {
      select.value = 'claude-3'
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await flush()
    })

    const saveButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Save',
    )!
    await act(async () => {
      saveButton.click()
      await flush()
    })

    expect(api.setRoleAssignment).toHaveBeenCalledWith({
      role: 'workers',
      modelSpec: 'claude-3',
    })
  })

  it('returns null when getAvailableModels is undefined', async () => {
    const api = {
      getAvailableModels: undefined,
      getRoleAssignments: vi.fn().mockResolvedValue([]),
      setRoleAssignment: vi.fn(),
    }
    await act(async () => {
      root.render(<ModelConfigPage api={api as never} />)
      await flush()
    })

    const el = container.querySelector('[data-testid="settings-page-model-config"]')
    expect(el).toBeNull()
  })

  it('displays persisted role assignments on load (round-trip)', async () => {
    const api = makeApi()
    api.getAvailableModels.mockResolvedValue({
      models: [
        { id: 'anthropic:claude-sonnet-4-20250514', name: 'Claude Sonnet', provider: 'anthropic', available: true },
        { id: 'openai:gpt-4o', name: 'GPT-4o', provider: 'openai', available: true },
        { id: 'ollama:llama3', name: 'llama3', provider: 'ollama', available: true },
      ],
    })
    api.getRoleAssignments.mockResolvedValue([
      { role: 'cortex-chat', providerId: 'anthropic:claude-sonnet-4-20250514' },
      { role: 'orchestrators', providerId: 'openai:gpt-4o' },
      { role: 'cortex-system', providerId: null },
      { role: 'workers', providerId: null },
    ])

    await act(async () => {
      root.render(<ModelConfigPage api={api} />)
      await flush()
    })

    const cortexChatSelect = container.querySelector<HTMLSelectElement>('#role-select-cortex-chat')!
    const orchestratorsSelect = container.querySelector<HTMLSelectElement>('#role-select-orchestrators')!
    const cortexSystemSelect = container.querySelector<HTMLSelectElement>('#role-select-cortex-system')!
    const workersSelect = container.querySelector<HTMLSelectElement>('#role-select-workers')!

    expect(cortexChatSelect.value).toBe('anthropic:claude-sonnet-4-20250514')
    expect(orchestratorsSelect.value).toBe('openai:gpt-4o')
    expect(cortexSystemSelect.value).toBe('')
    expect(workersSelect.value).toBe('')

    // Save button should be disabled (no pending changes)
    const saveButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Save',
    )!
    expect(saveButton.disabled).toBe(true)
  })

  it('no-models fallback renders with 4-slot layout', async () => {
    const api = makeApi()
    api.getAvailableModels.mockResolvedValue({ models: [] })

    await act(async () => {
      root.render(<ModelConfigPage api={api} />)
      await flush()
    })

    expect(container.textContent).toContain('No models available')
    // All 4 labels should still render
    expect(container.textContent).toContain('Cortex Chat')
    expect(container.textContent).toContain('Cortex System')
    expect(container.textContent).toContain('Agent Orchitect Orchestrator')
    expect(container.textContent).toContain('Agent Worker')
  })
})

// ─── SetupWizardPage ─────────────────────────────────────────────────────────

describe('SetupWizardPage', () => {
  it('renders re-run button', async () => {
    const api = {
      resetWizard: vi.fn().mockResolvedValue(undefined),
    }
    await act(async () => {
      root.render(<SetupWizardPage api={api} />)
      await flush()
    })

    const el = container.querySelector('[data-testid="settings-page-setup-wizard"]')
    expect(el).not.toBeNull()
    expect(container.textContent).toContain('Re-run Setup Wizard')
  })

  it('calls api.resetWizard and onWizardReset on confirmed click', async () => {
    const api = {
      resetWizard: vi.fn().mockResolvedValue(undefined),
    }
    const onWizardReset = vi.fn()

    await act(async () => {
      root.render(<SetupWizardPage api={api} onWizardReset={onWizardReset} />)
      await flush()
    })

    // Click the button to open ConfirmDeleteDialog
    const button = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Re-run Setup Wizard',
    )!
    await act(async () => {
      button.click()
      await flush()
    })

    // ConfirmDeleteDialog should be open
    const dialog = document.querySelector('[data-testid="confirm-delete-dialog"]')
    expect(dialog).not.toBeNull()

    // Type the confirm word and submit
    const input = document.querySelector('[data-testid="confirm-delete-input"]') as HTMLInputElement
    await act(async () => {
      input.focus()
      // Simulate typing "RESET"
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

    expect(api.resetWizard).toHaveBeenCalled()
    expect(onWizardReset).toHaveBeenCalled()
  })

  it('does not call resetWizard when confirm dialog is cancelled', async () => {
    const api = {
      resetWizard: vi.fn().mockResolvedValue(undefined),
    }

    await act(async () => {
      root.render(<SetupWizardPage api={api} />)
      await flush()
    })

    // Click the button to open dialog
    const button = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Re-run Setup Wizard',
    )!
    await act(async () => {
      button.click()
      await flush()
    })

    // Cancel the dialog by clicking the Cancel button
    const cancelBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Cancel',
    )!
    await act(async () => {
      cancelBtn.click()
      await flush()
    })

    expect(api.resetWizard).not.toHaveBeenCalled()
  })

  it('renders fallback UI when resetWizard is undefined', async () => {
    const api = {
      resetWizard: undefined,
    }
    await act(async () => {
      root.render(<SetupWizardPage api={api as never} />)
      await flush()
    })

    const el = container.querySelector('[data-testid="settings-page-setup-wizard"]')
    expect(el).not.toBeNull()
    // Button should be present but disabled
    const button = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Re-run Setup Wizard',
    )
    expect(button).not.toBeUndefined()
    expect(button!.disabled).toBe(true)
  })
})
