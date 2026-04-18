import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createElectronAPIMock,
  createFirstRunActionResult,
  createFirstRunState,
  createPrerequisites,
} from '../../../test-setup'
import { WIZARD_STEP_REGISTRY } from '../registry'
import { WizardStepConfirmation } from '../WizardStepConfirmation'
import { WizardStepModelDownload } from '../WizardStepModelDownload'
import { WizardStepOllamaSetup } from '../WizardStepOllamaSetup'
import { WizardStepWelcome } from '../WizardStepWelcome'

const trpcFetchMock = vi.hoisted(() => ({
  setBackendPort: vi.fn(),
  trpcQuery: vi.fn(),
  trpcMutate: vi.fn(),
}))

vi.mock('../trpc-fetch', () => trpcFetchMock)

function installMock() {
  const mock = createElectronAPIMock()
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: mock,
  })
  return mock
}

function createStepProps() {
  return {
    state: createFirstRunState(),
    prerequisites: createPrerequisites(),
    actionInProgress: false,
    actionError: null,
    setActionInProgress: vi.fn(),
    setActionError: vi.fn(),
    onStepComplete: vi.fn(),
  }
}

describe('WIZARD_STEP_REGISTRY invariants', () => {
  it('contains exactly the four V1 entries in canonical order', () => {
    expect(WIZARD_STEP_REGISTRY.map((entry) => entry.id)).toEqual([
      'welcome',
      'ollama-setup',
      'model-download',
      'confirmation',
    ])
  })

  it('does not include a role-assignment entry (dedicated step removed)', () => {
    const ids = WIZARD_STEP_REGISTRY.map((entry) => entry.id)
    expect(ids).not.toContain('role-assignment')
  })

  it('does not include an identity entry (added by SP 1.4)', () => {
    const ids = WIZARD_STEP_REGISTRY.map((entry) => entry.id)
    expect(ids).not.toContain('identity')
  })

  it('advertises the correct skippable flags per step', () => {
    const bySkippable = Object.fromEntries(
      WIZARD_STEP_REGISTRY.map((entry) => [entry.id, entry.skippable] as const),
    )
    expect(bySkippable).toEqual({
      welcome: false,
      'ollama-setup': true,
      'model-download': true,
      confirmation: false,
    })
  })

  it('binds each entry to its step component', () => {
    const byComponent = Object.fromEntries(
      WIZARD_STEP_REGISTRY.map((entry) => [entry.id, entry.component] as const),
    )
    expect(byComponent.welcome).toBe(WizardStepWelcome)
    expect(byComponent['ollama-setup']).toBe(WizardStepOllamaSetup)
    expect(byComponent['model-download']).toBe(WizardStepModelDownload)
    expect(byComponent.confirmation).toBe(WizardStepConfirmation)
  })
})

describe('Wizard step components', () => {
  beforeEach(() => {
    trpcFetchMock.trpcQuery.mockResolvedValue(null)
    trpcFetchMock.trpcMutate.mockResolvedValue(null)
  })

  it('renders the welcome step shell', () => {
    installMock()
    const props = createStepProps()

    render(<WizardStepWelcome {...props} onContinue={vi.fn()} />)

    expect(
      screen.getByText('Set up your local runtime in a few guided steps.'),
    ).toBeInTheDocument()
  })

  it('displays hardware information in the welcome step', () => {
    installMock()
    const props = createStepProps()

    render(<WizardStepWelcome {...props} onContinue={vi.fn()} />)

    expect(screen.getByText('32 GB')).toBeInTheDocument()
    expect(screen.getByText(/AMD Ryzen 9/)).toBeInTheDocument()
    expect(screen.getByText(/RTX 4080/)).toBeInTheDocument()
  })

  it('shows install button when Ollama is not installed', () => {
    installMock()
    const props = createStepProps()

    render(
      <WizardStepOllamaSetup
        {...props}
        ollamaStatus={{
          installed: false,
          running: false,
          state: 'not_installed',
          models: [],
          defaultModel: null,
        }}
        refreshOllamaStatus={vi.fn(async () => {})}
      />,
    )

    expect(screen.getByRole('button', { name: 'Install Ollama' })).toBeInTheDocument()
  })

  it('triggers IPC install flow when Install Ollama is clicked', async () => {
    const mock = installMock()
    const props = createStepProps()

    render(
      <WizardStepOllamaSetup
        {...props}
        ollamaStatus={{
          installed: false,
          running: false,
          state: 'not_installed',
          models: [],
          defaultModel: null,
        }}
        refreshOllamaStatus={vi.fn(async () => {})}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Install Ollama' }))

    await waitFor(() => {
      expect(mock.ollama.install).toHaveBeenCalled()
      expect(mock.ollama.onInstallProgress).toHaveBeenCalled()
    })
  })

  it('displays install progress phases', async () => {
    const mock = installMock()
    const props = createStepProps()

    let progressCallback: ((progress: { phase: string; message?: string }) => void) | null = null
    mock.ollama.onInstallProgress.mockImplementation((cb: (progress: { phase: string; message?: string }) => void) => {
      progressCallback = cb
      return () => {}
    })
    // Make install hang so we can observe progress
    mock.ollama.install.mockImplementation(() => new Promise(() => {}))

    render(
      <WizardStepOllamaSetup
        {...props}
        ollamaStatus={{
          installed: false,
          running: false,
          state: 'not_installed',
          models: [],
          defaultModel: null,
        }}
        refreshOllamaStatus={vi.fn(async () => {})}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Install Ollama' }))

    await waitFor(() => {
      expect(progressCallback).not.toBeNull()
    })

    act(() => {
      progressCallback!({ phase: 'downloading' })
    })

    await waitFor(() => {
      expect(screen.getByText('Downloading Ollama...')).toBeInTheDocument()
    })
  })

  it('displays error state with fallback link on install failure', async () => {
    const mock = installMock()
    const props = createStepProps()

    mock.ollama.install.mockResolvedValue({ success: false, error: 'Install failed' } as Record<string, unknown>)

    render(
      <WizardStepOllamaSetup
        {...props}
        ollamaStatus={{
          installed: false,
          running: false,
          state: 'not_installed',
          models: [],
          defaultModel: null,
        }}
        refreshOllamaStatus={vi.fn(async () => {})}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Install Ollama' }))

    await waitFor(() => {
      expect(screen.getByText('Install failed')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'download Ollama manually' })).toBeInTheDocument()
    })
  })

  it('displays elevation error with catch-and-instruct message', async () => {
    const mock = installMock()
    const props = createStepProps()

    mock.ollama.install.mockResolvedValue({
      success: false,
      elevationError: true,
      error: 'Installation requires elevated permissions.',
    } as Record<string, unknown>)

    render(
      <WizardStepOllamaSetup
        {...props}
        ollamaStatus={{
          installed: false,
          running: false,
          state: 'not_installed',
          models: [],
          defaultModel: null,
        }}
        refreshOllamaStatus={vi.fn(async () => {})}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Install Ollama' }))

    await waitFor(() => {
      expect(screen.getByText('Installation requires elevated permissions.')).toBeInTheDocument()
      expect(screen.getByText(/The installer needs elevated permissions/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'download it from the official site' })).toBeInTheDocument()
    })
  })

  it('shows a start button when Ollama is installed but stopped', () => {
    installMock()
    const props = createStepProps()

    render(
      <WizardStepOllamaSetup
        {...props}
        ollamaStatus={{
          installed: true,
          running: false,
          state: 'installed_stopped',
          models: [],
          defaultModel: null,
        }}
        refreshOllamaStatus={vi.fn(async () => {})}
      />,
    )

    expect(screen.getByRole('button', { name: 'Start Ollama' })).toBeInTheDocument()
  })

  it('marks the Ollama check complete when running and Continue is clicked', async () => {
    installMock()
    const props = createStepProps()
    const nextState = createFirstRunState({ currentStep: 'model_download' })
    trpcFetchMock.trpcMutate.mockResolvedValue(nextState)

    render(
      <WizardStepOllamaSetup
        {...props}
        ollamaStatus={createPrerequisites().ollama}
        refreshOllamaStatus={vi.fn(async () => {})}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(trpcFetchMock.trpcMutate).toHaveBeenCalledWith(
        'firstRun.completeStep',
        { step: 'ollama_check' },
      )
      expect(props.onStepComplete).toHaveBeenCalledTimes(1)
    })
  })

  it('preserves the WR-132.2 skip path in the Ollama step (F8)', async () => {
    installMock()
    const props = createStepProps()
    const nextState = createFirstRunState({ currentStep: 'model_download' })
    trpcFetchMock.trpcMutate.mockResolvedValue(nextState)

    render(
      <WizardStepOllamaSetup
        {...props}
        ollamaStatus={{
          installed: false,
          running: false,
          state: 'not_installed',
          models: [],
          defaultModel: null,
        }}
        refreshOllamaStatus={vi.fn(async () => {})}
      />,
    )

    // "Skip — I'll use cloud providers" affordance (WR-132.2). The en-dash is
    // rendered from `&rsquo;` + `—` in the component.
    const skipButton = screen.getByRole('button', { name: /Skip — I.*use cloud providers/i })
    fireEvent.click(skipButton)

    await waitFor(() => {
      expect(trpcFetchMock.trpcMutate).toHaveBeenCalledWith(
        'firstRun.completeStep',
        { step: 'ollama_check' },
      )
      expect(props.onStepComplete).toHaveBeenCalledWith(nextState)
    })
  })

  it('shows the recommended model in the download step', () => {
    installMock()
    const props = createStepProps()

    render(
      <WizardStepModelDownload
        {...props}
        selectedModelSpec="ollama:qwen2.5:7b"
        setSelectedModelSpec={vi.fn()}
      />,
    )

    expect(screen.getByText('Qwen 2.5 7B')).toBeInTheDocument()
    expect(screen.getByText(/Detected a high-spec desktop profile/)).toBeInTheDocument()
  })

  it('renders model library info link with external anchor', () => {
    installMock()
    const props = createStepProps()

    render(
      <WizardStepModelDownload
        {...props}
        selectedModelSpec="ollama:qwen2.5:7b"
        setSelectedModelSpec={vi.fn()}
      />,
    )

    const helper = screen.getByTestId('wizard-model-library-info-link')
    expect(helper).toBeInTheDocument()
    const anchor = helper.querySelector('a')
    expect(anchor).not.toBeNull()
    expect(anchor?.getAttribute('href')).toBe('https://ollama.com/library')
    expect(anchor?.getAttribute('target')).toBe('_blank')
    expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('runs the download flow, configures the provider, and placeholder-marks role_assignment on success (F7)', async () => {
    const mock = installMock()
    const props = createStepProps()
    // Build the two states the download path transitions through:
    //   1) after download+configureProvider — role_assignment still pending
    //   2) after placeholder auto-mark — role_assignment complete, currentStep: complete
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
      <WizardStepModelDownload
        {...props}
        selectedModelSpec="ollama:qwen2.5:7b"
        setSelectedModelSpec={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Download model' }))
    await waitFor(() => {
      expect(mock.ollama.pullModel).toHaveBeenCalledWith('qwen2.5:7b')
    })

    mock.__emitPullProgress({
      status: 'success',
      percent: 100,
      completed: 100,
      total: 100,
    })

    await waitFor(() => {
      expect(trpcFetchMock.trpcMutate).toHaveBeenCalledWith(
        'firstRun.downloadModel',
        { model: 'qwen2.5:7b' },
      )
      expect(trpcFetchMock.trpcMutate).toHaveBeenCalledWith(
        'firstRun.configureProvider',
        { modelSpec: 'ollama:qwen2.5:7b' },
      )
      // Placeholder auto-mark for role_assignment fires after configureProvider.
      expect(trpcFetchMock.trpcMutate).toHaveBeenCalledWith(
        'firstRun.completeStep',
        { step: 'role_assignment' },
      )
      // The final advance state carries role_assignment:complete and currentStep:complete.
      expect(props.onStepComplete).toHaveBeenCalledWith(afterRoleAssignmentPlaceholder)
    })
  })

  it('placeholder auto-mark is idempotent — skips completeStep when role_assignment is already complete', async () => {
    const mock = installMock()
    const props = {
      ...createStepProps(),
      // State arrives with role_assignment already complete (e.g. user resumed
      // after a mid-flight crash before the placeholder fired and re-landed
      // on model-download before navigating on).
      state: createFirstRunState({
        currentStep: 'model_download',
        steps: {
          ollama_check: { status: 'complete', completedAt: '2026-03-22T00:04:00.000Z' },
          model_download: { status: 'pending' },
          provider_config: { status: 'pending' },
          role_assignment: { status: 'complete', completedAt: '2026-03-22T00:05:00.000Z' },
        },
      }),
    }
    const afterConfigure = createFirstRunState({
      currentStep: 'complete',
      complete: true,
      steps: {
        ollama_check: { status: 'complete', completedAt: '2026-03-22T00:04:00.000Z' },
        model_download: { status: 'complete', completedAt: '2026-03-22T00:06:00.000Z' },
        provider_config: { status: 'complete', completedAt: '2026-03-22T00:06:00.000Z' },
        role_assignment: { status: 'complete', completedAt: '2026-03-22T00:05:00.000Z' },
      },
    })
    trpcFetchMock.trpcMutate.mockImplementation(async () =>
      createFirstRunActionResult(afterConfigure),
    )

    render(
      <WizardStepModelDownload
        {...props}
        selectedModelSpec="ollama:qwen2.5:7b"
        setSelectedModelSpec={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Download model' }))
    await waitFor(() => {
      expect(mock.ollama.pullModel).toHaveBeenCalledWith('qwen2.5:7b')
    })

    mock.__emitPullProgress({
      status: 'success',
      percent: 100,
      completed: 100,
      total: 100,
    })

    await waitFor(() => {
      expect(props.onStepComplete).toHaveBeenCalled()
    })

    // Placeholder completeStep for role_assignment must NOT have been called
    // because it was already complete.
    const mutateCalls = trpcFetchMock.trpcMutate.mock.calls
    const completeStepCalls = mutateCalls.filter(
      (call) =>
        call[0] === 'firstRun.completeStep' &&
        (call[1] as { step?: string })?.step === 'role_assignment',
    )
    expect(completeStepCalls).toHaveLength(0)
  })

  it('placeholder auto-mark fires on the skip path too (F7 — skip branch)', async () => {
    installMock()
    const props = createStepProps()
    const skippedState = createFirstRunState({
      currentStep: 'provider_config',
      steps: {
        ollama_check: { status: 'complete', completedAt: '2026-03-22T00:04:00.000Z' },
        model_download: { status: 'complete', completedAt: '2026-03-22T00:05:00.000Z' },
        provider_config: { status: 'pending' },
        role_assignment: { status: 'pending' },
      },
    })
    const providerSkippedState = createFirstRunState({
      currentStep: 'role_assignment',
      steps: {
        ollama_check: { status: 'complete', completedAt: '2026-03-22T00:04:00.000Z' },
        model_download: { status: 'complete', completedAt: '2026-03-22T00:05:00.000Z' },
        provider_config: { status: 'complete', completedAt: '2026-03-22T00:05:00.000Z' },
        role_assignment: { status: 'pending' },
      },
    })
    const finalState = createFirstRunState({
      currentStep: 'complete',
      complete: true,
      steps: {
        ollama_check: { status: 'complete', completedAt: '2026-03-22T00:04:00.000Z' },
        model_download: { status: 'complete', completedAt: '2026-03-22T00:05:00.000Z' },
        provider_config: { status: 'complete', completedAt: '2026-03-22T00:05:00.000Z' },
        role_assignment: { status: 'complete', completedAt: '2026-03-22T00:07:00.000Z' },
      },
    })
    let callCount = 0
    trpcFetchMock.trpcMutate.mockImplementation(async (procedure: string, input: unknown) => {
      callCount += 1
      const typedInput = input as { step?: string } | undefined
      if (procedure === 'firstRun.completeStep' && typedInput?.step === 'model_download') {
        return skippedState
      }
      if (procedure === 'firstRun.completeStep' && typedInput?.step === 'provider_config') {
        return providerSkippedState
      }
      if (procedure === 'firstRun.completeStep' && typedInput?.step === 'role_assignment') {
        return finalState
      }
      return null
    })
    void callCount

    render(
      <WizardStepModelDownload
        {...props}
        selectedModelSpec="ollama:qwen2.5:7b"
        setSelectedModelSpec={vi.fn()}
      />,
    )

    const skipButton = screen.getByRole('button', { name: /Skip — I.*add models later/i })
    fireEvent.click(skipButton)

    await waitFor(() => {
      expect(trpcFetchMock.trpcMutate).toHaveBeenCalledWith(
        'firstRun.completeStep',
        { step: 'model_download' },
      )
      expect(trpcFetchMock.trpcMutate).toHaveBeenCalledWith(
        'firstRun.completeStep',
        { step: 'provider_config' },
      )
      expect(trpcFetchMock.trpcMutate).toHaveBeenCalledWith(
        'firstRun.completeStep',
        { step: 'role_assignment' },
      )
      expect(props.onStepComplete).toHaveBeenCalledWith(finalState)
    })
  })

  it('shows the resume action when the model is already downloaded', () => {
    installMock()
    const props = createStepProps()
    const state = createFirstRunState({
      currentStep: 'provider_config',
      steps: {
        ollama_check: { status: 'complete', completedAt: '2026-03-22T00:04:00.000Z' },
        model_download: { status: 'complete', completedAt: '2026-03-22T00:05:00.000Z' },
        provider_config: { status: 'pending' },
        role_assignment: { status: 'pending' },
      },
    })

    render(
      <WizardStepModelDownload
        {...props}
        state={state}
        selectedModelSpec="ollama:qwen2.5:7b"
        setSelectedModelSpec={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Use downloaded model' })).toBeInTheDocument()
  })

  it('shows the completion summary after setup', () => {
    installMock()
    const props = createStepProps()

    render(
      <WizardStepConfirmation
        {...props}
        selectedModelSpec="ollama:qwen2.5:7b"
        roleAssignments={{
          orchestrators: 'ollama:qwen2.5:7b',
          workers: 'ollama:qwen2.5:14b',
        }}
        ollamaStatus={createPrerequisites().ollama}
        onFinish={vi.fn()}
      />,
    )

    expect(screen.getByText('Configuration saved')).toBeInTheDocument()
    expect(screen.getByText('Role assignments')).toBeInTheDocument()
  })

  it('calls onFinish from the confirmation step', () => {
    installMock()
    const props = createStepProps()
    const onFinish = vi.fn()

    render(
      <WizardStepConfirmation
        {...props}
        selectedModelSpec="ollama:qwen2.5:7b"
        roleAssignments={{}}
        ollamaStatus={createPrerequisites().ollama}
        onFinish={onFinish}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open workspace' }))

    expect(onFinish).toHaveBeenCalledTimes(1)
  })
})
