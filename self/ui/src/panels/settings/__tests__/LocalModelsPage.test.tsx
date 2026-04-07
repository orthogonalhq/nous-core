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
})
