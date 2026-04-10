// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalModelsPage } from '../pages/LocalModelsPage'

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

function makeApi(overrides: Record<string, unknown> = {}) {
  return {
    getSystemStatus: vi.fn().mockResolvedValue({
      ollama: { running: true, models: [] },
      configuredProviders: [],
      credentialVaultHealthy: true,
    }),
    listOllamaModels: vi.fn().mockResolvedValue({ models: [] }),
    pullOllamaModel: vi.fn().mockResolvedValue({ success: true }),
    deleteOllamaModel: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  }
}

interface MockOllamaBridge {
  getVersion: ReturnType<typeof vi.fn>
  checkUpdate: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  onUpdateProgress: ReturnType<typeof vi.fn>
}

function installOllamaMock(overrides: Partial<MockOllamaBridge> = {}): MockOllamaBridge {
  const bridge: MockOllamaBridge = {
    getVersion: vi.fn().mockResolvedValue({
      version: '0.3.14',
      meetsMinimum: true,
      minimumVersion: '0.3.12',
    }),
    checkUpdate: vi.fn().mockResolvedValue({ state: 'up-to-date', detail: 'Up to date' }),
    update: vi.fn().mockResolvedValue({ success: true }),
    onUpdateProgress: vi.fn(() => () => {}),
    ...overrides,
  }
  ;(
    globalThis as typeof globalThis & {
      window: Window & { electronAPI?: unknown }
    }
  ).window.electronAPI = { ollama: bridge } as unknown
  return bridge
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  installOllamaMock()
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
    await flush()
  })
  container.remove()
  delete (globalThis as typeof globalThis & { window: Window & { electronAPI?: unknown } }).window
    .electronAPI
  vi.restoreAllMocks()
})

describe('LocalModelsPage', () => {
  it('renders Ollama-not-running state when Ollama is down', async () => {
    const api = makeApi({
      getSystemStatus: vi.fn().mockResolvedValue({
        ollama: { running: false, models: [] },
        configuredProviders: [],
        credentialVaultHealthy: true,
      }),
    })

    await act(async () => {
      root.render(<LocalModelsPage api={api} />)
      await flush()
    })

    const el = container.querySelector('[data-testid="settings-page-local-models"]')
    expect(el).not.toBeNull()
    expect(container.textContent).toContain('Ollama is not running')
  })

  it('renders model cards when models are present', async () => {
    const api = makeApi({
      listOllamaModels: vi.fn().mockResolvedValue({
        models: [
          { name: 'llama3.2:3b', size: 2_000_000_000, modifiedAt: '2026-01-01T00:00:00Z' },
          { name: 'codellama:7b', size: 4_000_000_000, modifiedAt: '2026-02-01T00:00:00Z' },
        ],
      }),
    })

    await act(async () => {
      root.render(<LocalModelsPage api={api} />)
      await flush()
    })

    const cards = container.querySelectorAll('[data-testid="model-card"]')
    expect(cards).toHaveLength(2)
    expect(container.textContent).toContain('llama3.2:3b')
    expect(container.textContent).toContain('codellama:7b')
  })

  it('renders pull input and button', async () => {
    const api = makeApi()

    await act(async () => {
      root.render(<LocalModelsPage api={api} />)
      await flush()
    })

    const input = container.querySelector('[data-testid="pull-model-input"]')
    const button = container.querySelector('[data-testid="pull-model-button"]')
    expect(input).not.toBeNull()
    expect(button).not.toBeNull()
  })

  it('delete button triggers ConfirmDeleteDialog', async () => {
    const api = makeApi({
      listOllamaModels: vi.fn().mockResolvedValue({
        models: [
          { name: 'llama3.2:3b', size: 2_000_000_000, modifiedAt: '2026-01-01T00:00:00Z' },
        ],
      }),
    })

    await act(async () => {
      root.render(<LocalModelsPage api={api} />)
      await flush()
    })

    // Click the delete button on the model card
    const deleteButton = container.querySelector('[data-testid="delete-model-button"]') as HTMLButtonElement
    expect(deleteButton).not.toBeNull()

    await act(async () => {
      deleteButton.click()
      await flush()
    })

    // ConfirmDeleteDialog should appear
    const dialog = document.querySelector('[data-testid="confirm-delete-dialog"]')
    expect(dialog).not.toBeNull()
  })

  it('delete + refresh flow calls deleteOllamaModel and then refreshes model list', async () => {
    const listFn = vi.fn()
      .mockResolvedValueOnce({
        models: [
          { name: 'llama3.2:3b', size: 2_000_000_000, modifiedAt: '2026-01-01T00:00:00Z' },
        ],
      })
      .mockResolvedValue({ models: [] })

    const deleteFn = vi.fn().mockResolvedValue({ success: true })
    const api = makeApi({
      listOllamaModels: listFn,
      deleteOllamaModel: deleteFn,
    })

    await act(async () => {
      root.render(<LocalModelsPage api={api} />)
      await flush()
    })

    // Click delete
    const deleteButton = container.querySelector('[data-testid="delete-model-button"]') as HTMLButtonElement
    await act(async () => {
      deleteButton.click()
      await flush()
    })

    // Type confirm word in ConfirmDeleteDialog
    const input = document.querySelector('[data-testid="confirm-delete-input"]') as HTMLInputElement
    await act(async () => {
      input.focus()
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'value',
      )!.set!.call(input, 'DELETE')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await flush()
    })

    // Click confirm
    const submitBtn = document.querySelector('[data-testid="confirm-delete-submit"]') as HTMLButtonElement
    await act(async () => {
      submitBtn.click()
      await flush()
    })

    expect(deleteFn).toHaveBeenCalledWith('llama3.2:3b')
    // listOllamaModels is called: once on mount, once after delete
    expect(listFn.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  describe('version row', () => {
    it('renders version row with detected version', async () => {
      const api = makeApi()
      await act(async () => {
        root.render(<LocalModelsPage api={api} />)
        await flush()
      })
      const row = container.querySelector('[data-testid="ollama-version-row"]')
      expect(row).not.toBeNull()
      expect(row?.textContent).toContain('0.3.14')
    })

    it('renders version row as Unknown when getVersion returns unknown', async () => {
      installOllamaMock({
        getVersion: vi.fn().mockResolvedValue({
          version: 'unknown',
          meetsMinimum: true,
          minimumVersion: '0.3.12',
        }),
      })
      const api = makeApi()
      await act(async () => {
        root.render(<LocalModelsPage api={api} />)
        await flush()
      })
      const row = container.querySelector('[data-testid="ollama-version-row"]')
      expect(row?.textContent).toContain('Unknown')
    })

    it('renders version row as Unknown when getVersion rejects (independence)', async () => {
      installOllamaMock({
        getVersion: vi.fn().mockRejectedValue(new Error('failed')),
      })
      const api = makeApi()
      await act(async () => {
        root.render(<LocalModelsPage api={api} />)
        await flush()
      })
      const row = container.querySelector('[data-testid="ollama-version-row"]')
      expect(row).not.toBeNull()
      expect(row?.textContent).toContain('Unknown')
    })
  })

  describe('version-floor warning', () => {
    it('does not render warning when meetsMinimum is true', async () => {
      const api = makeApi()
      await act(async () => {
        root.render(<LocalModelsPage api={api} />)
        await flush()
      })
      expect(container.querySelector('[data-testid="version-floor-warning"]')).toBeNull()
    })

    it('renders warning when meetsMinimum is false', async () => {
      installOllamaMock({
        getVersion: vi.fn().mockResolvedValue({
          version: '0.2.1',
          meetsMinimum: false,
          minimumVersion: '0.3.12',
        }),
      })
      const api = makeApi()
      await act(async () => {
        root.render(<LocalModelsPage api={api} />)
        await flush()
      })
      const warning = container.querySelector('[data-testid="version-floor-warning"]')
      expect(warning).not.toBeNull()
      expect(warning?.textContent).toContain('0.3.12')
    })

    it('does not render warning when getVersion fails (independence)', async () => {
      installOllamaMock({
        getVersion: vi.fn().mockRejectedValue(new Error('failed')),
      })
      const api = makeApi()
      await act(async () => {
        root.render(<LocalModelsPage api={api} />)
        await flush()
      })
      expect(container.querySelector('[data-testid="version-floor-warning"]')).toBeNull()
    })
  })

  describe('update-available banner', () => {
    it('does not render when state is up-to-date', async () => {
      const api = makeApi()
      await act(async () => {
        root.render(<LocalModelsPage api={api} />)
        await flush()
      })
      expect(container.querySelector('[data-testid="update-available-banner"]')).toBeNull()
    })

    it('renders with installed+latest when state is available', async () => {
      installOllamaMock({
        checkUpdate: vi.fn().mockResolvedValue({
          state: 'available',
          installedVersion: '0.3.10',
          latestVersion: '0.3.14',
          detail: 'Installed 0.3.10, latest 0.3.14',
        }),
      })
      const api = makeApi()
      await act(async () => {
        root.render(<LocalModelsPage api={api} />)
        await flush()
      })
      const banner = container.querySelector('[data-testid="update-available-banner"]')
      expect(banner).not.toBeNull()
      expect(banner?.textContent).toContain('0.3.10')
      expect(banner?.textContent).toContain('0.3.14')
      expect(container.querySelector('[data-testid="update-ollama-button"]')).not.toBeNull()
    })

    it('clicking Update calls electronAPI.ollama.update and shows progress', async () => {
      let resolveUpdate: (value: { success: boolean }) => void = () => {}
      const updatePromise = new Promise<{ success: boolean }>((resolve) => {
        resolveUpdate = resolve
      })
      const bridge = installOllamaMock({
        checkUpdate: vi.fn().mockResolvedValue({
          state: 'available',
          installedVersion: '0.3.10',
          latestVersion: '0.3.14',
          detail: 'Installed 0.3.10, latest 0.3.14',
        }),
        update: vi.fn().mockImplementation(() => updatePromise),
      })
      const api = makeApi()
      await act(async () => {
        root.render(<LocalModelsPage api={api} />)
        await flush()
      })
      const button = container.querySelector(
        '[data-testid="update-ollama-button"]',
      ) as HTMLButtonElement
      expect(button).not.toBeNull()
      await act(async () => {
        button.click()
        await flush()
      })
      expect(bridge.update).toHaveBeenCalled()
      // progress element should render while updating
      expect(container.querySelector('[data-testid="update-progress"]')).not.toBeNull()
      // Clean up pending promise
      resolveUpdate({ success: true })
      await act(async () => {
        await flush()
      })
    })

    it('does not render banner when checkUpdate fails (independence)', async () => {
      installOllamaMock({
        checkUpdate: vi.fn().mockRejectedValue(new Error('check failed')),
      })
      const api = makeApi()
      await act(async () => {
        root.render(<LocalModelsPage api={api} />)
        await flush()
      })
      expect(container.querySelector('[data-testid="update-available-banner"]')).toBeNull()
      // Version row still present (independence).
      expect(container.querySelector('[data-testid="ollama-version-row"]')).not.toBeNull()
    })
  })

  describe('model library info link', () => {
    it('renders info link card when ollama is running', async () => {
      const api = makeApi()
      await act(async () => {
        root.render(<LocalModelsPage api={api} />)
        await flush()
      })
      const card = container.querySelector('[data-testid="model-library-info-link"]')
      expect(card).not.toBeNull()
      const anchor = card?.querySelector('a')
      expect(anchor).not.toBeNull()
      expect(anchor?.getAttribute('href')).toBe('https://ollama.com/library')
      expect(anchor?.getAttribute('target')).toBe('_blank')
      expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer')
    })

    it('does not render info link when ollama is not running', async () => {
      const api = makeApi({
        getSystemStatus: vi.fn().mockResolvedValue({
          ollama: { running: false, models: [] },
          configuredProviders: [],
          credentialVaultHealthy: true,
        }),
      })
      await act(async () => {
        root.render(<LocalModelsPage api={api} />)
        await flush()
      })
      expect(container.querySelector('[data-testid="model-library-info-link"]')).toBeNull()
    })
  })

  describe('independence (I10)', () => {
    it('renders all three independent UI elements when all APIs succeed', async () => {
      const api = makeApi()
      await act(async () => {
        root.render(<LocalModelsPage api={api} />)
        await flush()
      })
      expect(container.querySelector('[data-testid="ollama-version-row"]')).not.toBeNull()
      expect(container.querySelector('[data-testid="model-library-info-link"]')).not.toBeNull()
      // Banner absent because state is 'up-to-date'.
      expect(container.querySelector('[data-testid="update-available-banner"]')).toBeNull()
    })

    it('renders version row when checkUpdate fails but getVersion succeeds', async () => {
      installOllamaMock({
        checkUpdate: vi.fn().mockRejectedValue(new Error('check failed')),
      })
      const api = makeApi()
      await act(async () => {
        root.render(<LocalModelsPage api={api} />)
        await flush()
      })
      const row = container.querySelector('[data-testid="ollama-version-row"]')
      expect(row).not.toBeNull()
      expect(row?.textContent).toContain('0.3.14')
    })

    it('renders update banner when getVersion fails but checkUpdate returns available', async () => {
      installOllamaMock({
        getVersion: vi.fn().mockRejectedValue(new Error('version failed')),
        checkUpdate: vi.fn().mockResolvedValue({
          state: 'available',
          installedVersion: '0.3.10',
          latestVersion: '0.3.14',
          detail: '',
        }),
      })
      const api = makeApi()
      await act(async () => {
        root.render(<LocalModelsPage api={api} />)
        await flush()
      })
      expect(container.querySelector('[data-testid="update-available-banner"]')).not.toBeNull()
    })
  })
})
