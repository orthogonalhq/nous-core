// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PreferencesPanel, type PreferencesApi } from '../PreferencesPanel.js'

const ROLE_LABELS = [
  'Orchestrator',
  'Reasoner',
  'Tool Advisor',
  'Summarizer',
  'Embedder',
  'Reranker',
  'Vision',
] as const

const ROLE_KEYS = [
  'orchestrator',
  'reasoner',
  'tool-advisor',
  'summarizer',
  'embedder',
  'reranker',
  'vision',
] as const

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
    getModelSelection: async () => ({
      principal: 'openai:gpt-4o',
      system: 'ollama:qwen2.5:7b',
    }),
    setModelSelection: async () => ({ success: true }),
    ...overrides,
  }
}

function createRoleAssignments(
  overrides: Partial<Record<(typeof ROLE_KEYS)[number], string | null>> = {},
) {
  const defaults: Record<(typeof ROLE_KEYS)[number], string | null> = {
    orchestrator: 'ollama:qwen2.5:7b',
    reasoner: 'openai:gpt-4o',
    'tool-advisor': 'anthropic:claude-sonnet-4-20250514',
    summarizer: 'ollama:qwen2.5:7b',
    embedder: 'ollama:qwen2.5:7b',
    reranker: 'ollama:qwen2.5:7b',
    vision: 'openai:gpt-4o',
  }

  return ROLE_KEYS.map((role) => {
    const modelSpec = role in overrides ? overrides[role]! : defaults[role]
    if (!modelSpec) {
      return { role, providerId: null }
    }

    return {
      role,
      providerId: `${role}-provider`,
      modelSpec,
      displayName: modelSpec.split(':').slice(1).join(':'),
    }
  })
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

function getSelectByAriaLabel(label: string): HTMLSelectElement {
  const select = container.querySelector(`select[aria-label="${label}"]`)

  if (!(select instanceof HTMLSelectElement)) {
    throw new Error(`Select not found: ${label}`)
  }

  return select
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
  })
}

async function changeSelect(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
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

describe('PreferencesPanel role assignment settings', () => {
  it('renders the role assignment section when the API is provided', async () => {
    const api = createBaseApi({
      getRoleAssignments: async () => createRoleAssignments() as any,
      setRoleAssignment: async () => ({ success: true }),
    })

    await renderPanel(api)

    expect(textContent()).toContain('Role Assignments')
    for (const label of ROLE_LABELS) {
      expect(textContent()).toContain(label)
    }
  })

  it('displays all 7 roles with their current assignments', async () => {
    const api = createBaseApi({
      getRoleAssignments: async () => createRoleAssignments() as any,
      setRoleAssignment: async () => ({ success: true }),
    })

    await renderPanel(api)

    expect(textContent()).toContain('Qwen 2.5 7B')
    expect(textContent()).toContain('GPT-4o')
    expect(textContent()).toContain('Claude Sonnet 4')
  })

  it('changing a role and saving calls setRoleAssignment with the correct args', async () => {
    const setRoleAssignment = vi.fn(async () => ({ success: true }))
    const api = createBaseApi({
      getRoleAssignments: async () => createRoleAssignments() as any,
      setRoleAssignment,
    })

    await renderPanel(api)
    await changeSelect(
      getSelectByAriaLabel('Orchestrator assignment'),
      'anthropic:claude-sonnet-4-20250514',
    )
    await click(getButton('Save Role Assignments'))

    expect(setRoleAssignment).toHaveBeenCalledWith({
      role: 'orchestrator',
      modelSpec: 'anthropic:claude-sonnet-4-20250514',
    })
  })

  it('Apply to All Roles saves the chosen model for each role', async () => {
    const setRoleAssignment = vi.fn(async () => ({ success: true }))
    const api = createBaseApi({
      getRoleAssignments: async () => createRoleAssignments() as any,
      setRoleAssignment,
    })

    await renderPanel(api)
    await changeSelect(
      getSelectByAriaLabel('Apply one model to every role'),
      'openai:gpt-4o',
    )
    await click(getButton('Apply to All Roles'))

    expect(setRoleAssignment).toHaveBeenCalledTimes(ROLE_KEYS.length)
    expect(
      (setRoleAssignment.mock.calls as unknown as Array<[{ role: string }]>).map(
        (call) => call[0].role,
      ),
    ).toEqual([...ROLE_KEYS])
  })

  it('shows an error message when a role assignment save fails', async () => {
    const setRoleAssignment = vi.fn(async (input: { role: string }) => {
      if (input.role === 'reasoner') {
        return { success: false, error: 'Reasoner update failed.' }
      }

      return { success: true }
    })
    const api = createBaseApi({
      getRoleAssignments: async () => createRoleAssignments() as any,
      setRoleAssignment,
    })

    await renderPanel(api)
    await changeSelect(getSelectByAriaLabel('Reasoner assignment'), 'anthropic:claude-sonnet-4-20250514')
    await click(getButton('Save Role Assignments'))

    expect(textContent()).toContain('Error: Reasoner update failed.')
  })

  it('shows Not assigned for null assignments', async () => {
    const api = createBaseApi({
      getRoleAssignments: async () => createRoleAssignments({
        orchestrator: null,
        reasoner: null,
      }) as any,
      setRoleAssignment: async () => ({ success: true }),
    })

    await renderPanel(api)

    expect((textContent().match(/Not assigned/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('renders without role assignment methods for backwards compatibility', async () => {
    const api = createBaseApi()

    await renderPanel(api)

    expect(textContent()).not.toContain('Role Assignments')
    expect(textContent()).toContain('Model Configuration')
  })

  it('renders a fully empty state when all 7 roles are unassigned', async () => {
    const api = createBaseApi({
      getRoleAssignments: async () => createRoleAssignments({
        orchestrator: null,
        reasoner: null,
        'tool-advisor': null,
        summarizer: null,
        embedder: null,
        reranker: null,
        vision: null,
      }) as any,
      setRoleAssignment: async () => ({ success: true }),
    })

    await renderPanel(api)

    expect((textContent().match(/Not assigned/g) ?? []).length).toBeGreaterThanOrEqual(7)
  })

  it('renders mixed assigned and unassigned role states', async () => {
    const api = createBaseApi({
      getRoleAssignments: async () => createRoleAssignments({
        orchestrator: 'openai:gpt-4o',
        reasoner: null,
        'tool-advisor': 'anthropic:claude-sonnet-4-20250514',
        summarizer: null,
      }) as any,
      setRoleAssignment: async () => ({ success: true }),
    })

    await renderPanel(api)

    expect(textContent()).toContain('GPT-4o')
    expect(textContent()).toContain('Claude Sonnet 4')
    expect(textContent()).toContain('Not assigned')
  })

  it('renders the re-run wizard control and calls reset + callback', async () => {
    const resetWizard = vi.fn(async () => ({ complete: false }))
    const onWizardReset = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const api = createBaseApi({
      resetWizard,
      getRoleAssignments: async () => createRoleAssignments() as any,
      setRoleAssignment: async () => ({ success: true }),
    })

    await renderPanel(api, { onWizardReset })
    await click(getButton('Re-run Setup Wizard'))

    expect(resetWizard).toHaveBeenCalledTimes(1)
    expect(onWizardReset).toHaveBeenCalledTimes(1)
  })
})
