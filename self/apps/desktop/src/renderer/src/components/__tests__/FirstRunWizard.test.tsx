import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createElectronAPIMock,
  createFirstRunActionResult,
  createFirstRunState,
  createPrerequisites,
  DEFAULT_PREREQUISITES,
} from '../../test-setup'
import { FirstRunWizard } from '../FirstRunWizard'
import {
  PREVIOUS_STEP_MAP,
  WIZARD_STEP_REGISTRY,
} from '../wizard/registry'

const trpcFetchMock = vi.hoisted(() => ({
  setBackendPort: vi.fn(),
  trpcQuery: vi.fn(),
  trpcMutate: vi.fn(),
}))

vi.mock('../wizard/trpc-fetch', () => trpcFetchMock)

function installMock() {
  const mock = createElectronAPIMock()
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: mock,
  })
  return mock
}

describe('FirstRunWizard', () => {
  beforeEach(() => {
    trpcFetchMock.trpcQuery.mockImplementation(async (procedure: string) => {
      if (procedure === 'firstRun.checkPrerequisites') return DEFAULT_PREREQUISITES
      return null
    })
    trpcFetchMock.trpcMutate.mockImplementation(async () => createFirstRunState())
  })

  it('renders the welcome step for a fresh ollama_check state', async () => {
    installMock()

    render(
      <FirstRunWizard
        initialState={createFirstRunState()}
        onComplete={vi.fn()}
      />,
    )

    expect(
      await screen.findByText('Set up your local runtime in a few guided steps.'),
    ).toBeInTheDocument()
  })

  it('loads prerequisites and subscribes to Ollama state changes on mount', async () => {
    const mock = installMock()

    render(
      <FirstRunWizard
        initialState={createFirstRunState()}
        onComplete={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(trpcFetchMock.trpcQuery).toHaveBeenCalled()
      expect(mock.ollama.onStateChange).toHaveBeenCalledTimes(1)
    })
  })

  it('cleans up the Ollama state subscription on unmount', () => {
    const mock = installMock()
    const cleanup = vi.fn()
    mock.ollama.onStateChange.mockImplementation(() => cleanup)

    const view = render(
      <FirstRunWizard
        initialState={createFirstRunState()}
        onComplete={vi.fn()}
      />,
    )

    view.unmount()

    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('advances from the welcome step to the Ollama setup step', async () => {
    installMock()

    render(
      <FirstRunWizard
        initialState={createFirstRunState()}
        onComplete={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Continue setup' }))

    expect(
      await screen.findByText(/Ollama is ready/),
    ).toBeInTheDocument()
  })

  it('resumes directly at the model download step when the backend state says so', async () => {
    installMock()

    render(
      <FirstRunWizard
        initialState={createFirstRunState({
          currentStep: 'model_download',
          steps: {
            ollama_check: {
              status: 'complete',
              completedAt: '2026-03-22T00:04:00.000Z',
            },
            model_download: { status: 'pending' },
            provider_config: { status: 'pending' },
            role_assignment: { status: 'pending' },
          },
        })}
        onComplete={vi.fn()}
      />,
    )

    expect(
      await screen.findByText('Download the local model that fits this machine.'),
    ).toBeInTheDocument()
  })

  it('shows a prerequisites error and retries the request', async () => {
    installMock()
    let prereqCallCount = 0
    trpcFetchMock.trpcQuery.mockImplementation(async (procedure: string) => {
      if (procedure === 'firstRun.checkPrerequisites') {
        prereqCallCount++
        if (prereqCallCount === 1) throw new Error('prerequisites failed')
        return createPrerequisites()
      }
      return null
    })

    render(
      <FirstRunWizard
        initialState={createFirstRunState()}
        onComplete={vi.fn()}
      />,
    )

    expect(await screen.findByText('prerequisites failed')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry prerequisites' }))

    await waitFor(() => {
      expect(prereqCallCount).toBeGreaterThanOrEqual(2)
    })
  })

  it('reacts to live Ollama status updates from the preload subscription', async () => {
    const mock = installMock()

    render(
      <FirstRunWizard
        initialState={createFirstRunState()}
        onComplete={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Continue setup' }))

    mock.__emitOllamaStateChange({
      installed: false,
      running: false,
      state: 'not_installed',
      models: [],
      defaultModel: null,
    })

    expect((await screen.findAllByText('Not installed')).length).toBeGreaterThan(0)
  })
})

describe('FirstRunWizard — registry-driven invariants', () => {
  beforeEach(() => {
    trpcFetchMock.trpcQuery.mockImplementation(async (procedure: string) => {
      if (procedure === 'firstRun.checkPrerequisites') return DEFAULT_PREREQUISITES
      return null
    })
    trpcFetchMock.trpcMutate.mockImplementation(async () => createFirstRunState())
  })

  it('PREVIOUS_STEP_MAP walks confirmation → model-download → ollama-setup → welcome → null (F4)', () => {
    // Start from confirmation and step back to the root.
    const chain: Array<string | null> = []
    let cursor: string | null = 'confirmation'
    while (cursor !== null) {
      chain.push(cursor)
      cursor = PREVIOUS_STEP_MAP[cursor as keyof typeof PREVIOUS_STEP_MAP] ?? null
    }
    chain.push(null)
    expect(chain).toEqual([
      'confirmation',
      'model-download',
      'ollama-setup',
      'welcome',
      null,
    ])
  })

  it('PREVIOUS_STEP_MAP never references the removed role-assignment step (F5)', () => {
    const values = Object.values(PREVIOUS_STEP_MAP)
    expect(values).not.toContain('role-assignment')
    const keys = Object.keys(PREVIOUS_STEP_MAP)
    expect(keys).not.toContain('role-assignment')
  })

  it('renders exactly WIZARD_STEP_REGISTRY.length stepper slots (F6)', async () => {
    installMock()

    render(
      <FirstRunWizard
        initialState={createFirstRunState()}
        onComplete={vi.fn()}
      />,
    )

    await screen.findByText('Set up your local runtime in a few guided steps.')
    const stepper = screen.getByRole('navigation', { name: /first-run wizard steps/i })
    expect(stepper.children.length).toBe(WIZARD_STEP_REGISTRY.length)
  })

  it('wires the CSS custom property --nous-wizard-step-count to WIZARD_STEP_REGISTRY.length (F6)', async () => {
    installMock()

    render(
      <FirstRunWizard
        initialState={createFirstRunState()}
        onComplete={vi.fn()}
      />,
    )

    await screen.findByText('Set up your local runtime in a few guided steps.')
    const stepper = screen.getByRole('navigation', { name: /first-run wizard steps/i }) as HTMLElement
    expect(stepper.style.getPropertyValue('--nous-wizard-step-count')).toBe(
      String(WIZARD_STEP_REGISTRY.length),
    )
  })

  it('back-nav from ollama-setup to welcome re-enables welcome gating', async () => {
    installMock()

    render(
      <FirstRunWizard
        initialState={createFirstRunState({
          currentStep: 'ollama_check',
        })}
        onComplete={vi.fn()}
      />,
    )

    // Advance to ollama-setup via the welcome continue button.
    fireEvent.click(await screen.findByRole('button', { name: 'Continue setup' }))
    await screen.findByText(/Ollama is ready/)

    // Back button should now be rendered (welcome is previous).
    fireEvent.click(screen.getByTestId('wizard-back-button'))

    // After back-nav, the welcome screen is visible again.
    expect(
      await screen.findByText('Set up your local runtime in a few guided steps.'),
    ).toBeInTheDocument()
  })

  it('full download path advances through placeholder auto-mark to confirmation (F7)', async () => {
    const mock = installMock()

    const resumeState = createFirstRunState({
      currentStep: 'model_download',
      steps: {
        ollama_check: { status: 'complete', completedAt: '2026-03-22T00:04:00.000Z' },
        model_download: { status: 'pending' },
        provider_config: { status: 'pending' },
        role_assignment: { status: 'pending' },
      },
    })

    const afterConfigureProvider = createFirstRunState({
      currentStep: 'role_assignment',
      steps: {
        ollama_check: { status: 'complete', completedAt: '2026-03-22T00:04:00.000Z' },
        model_download: { status: 'complete', completedAt: '2026-03-22T00:05:00.000Z' },
        provider_config: { status: 'complete', completedAt: '2026-03-22T00:06:00.000Z' },
        role_assignment: { status: 'pending' },
      },
    })
    const afterRoleAssignmentPlaceholder = createFirstRunState({
      currentStep: 'complete',
      complete: true,
      steps: {
        ollama_check: { status: 'complete', completedAt: '2026-03-22T00:04:00.000Z' },
        model_download: { status: 'complete', completedAt: '2026-03-22T00:05:00.000Z' },
        provider_config: { status: 'complete', completedAt: '2026-03-22T00:06:00.000Z' },
        role_assignment: { status: 'complete', completedAt: '2026-03-22T00:07:00.000Z' },
      },
    })

    trpcFetchMock.trpcMutate.mockImplementation(async (procedure: string) => {
      if (procedure === 'firstRun.downloadModel' || procedure === 'firstRun.configureProvider') {
        return createFirstRunActionResult(afterConfigureProvider)
      }
      if (procedure === 'firstRun.completeStep') {
        return afterRoleAssignmentPlaceholder
      }
      return null
    })

    render(
      <FirstRunWizard initialState={resumeState} onComplete={vi.fn()} />,
    )

    // Renderer lands on model-download (backend currentStep === model_download).
    fireEvent.click(await screen.findByRole('button', { name: 'Download model' }))

    await waitFor(() => {
      expect(mock.ollama.pullModel).toHaveBeenCalledWith('qwen2.5:7b')
    })

    mock.__emitPullProgress({
      status: 'success',
      percent: 100,
      completed: 100,
      total: 100,
    })

    // After the full download + configure + placeholder chain, the wizard
    // transitions to the confirmation step.
    expect(
      await screen.findByText('Your desktop runtime is ready.'),
    ).toBeInTheDocument()

    // The placeholder auto-mark for role_assignment must have fired.
    expect(trpcFetchMock.trpcMutate).toHaveBeenCalledWith(
      'firstRun.completeStep',
      { step: 'role_assignment' },
    )
  })

  it('calls onComplete when the confirmation "Open workspace" button is pressed', async () => {
    installMock()
    const onComplete = vi.fn()

    render(
      <FirstRunWizard
        initialState={createFirstRunState({
          currentStep: 'complete',
          complete: true,
          steps: {
            ollama_check: { status: 'complete', completedAt: '2026-03-22T00:04:00.000Z' },
            model_download: { status: 'complete', completedAt: '2026-03-22T00:05:00.000Z' },
            provider_config: { status: 'complete', completedAt: '2026-03-22T00:06:00.000Z' },
            role_assignment: { status: 'complete', completedAt: '2026-03-22T00:07:00.000Z' },
          },
        })}
        onComplete={onComplete}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Open workspace' }))

    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
