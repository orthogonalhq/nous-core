import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createElectronAPIMock,
  createFirstRunActionResult,
  createFirstRunState,
  createPrerequisites,
} from '../../../test-setup'
import { WizardStepConfirmation } from '../WizardStepConfirmation'
import { WizardStepModelDownload } from '../WizardStepModelDownload'
import { WizardStepOllamaSetup } from '../WizardStepOllamaSetup'
import { WizardStepRoleAssignment } from '../WizardStepRoleAssignment'
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
      expect(screen.getByText('downloading...')).toBeInTheDocument()
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

  it('runs the download flow and finalizes provider configuration on success', async () => {
    const mock = installMock()
    const props = createStepProps()
    const nextState = createFirstRunState({
      currentStep: 'role_assignment',
      steps: {
        ollama_check: { status: 'complete', completedAt: '2026-03-22T00:04:00.000Z' },
        model_download: { status: 'complete', completedAt: '2026-03-22T00:05:00.000Z' },
        provider_config: { status: 'complete', completedAt: '2026-03-22T00:06:00.000Z' },
        role_assignment: { status: 'pending' },
      },
    })
    trpcFetchMock.trpcMutate.mockResolvedValue(
      createFirstRunActionResult(nextState),
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
      expect(trpcFetchMock.trpcMutate).toHaveBeenCalledWith(
        'firstRun.downloadModel',
        { model: 'qwen2.5:7b' },
      )
      expect(trpcFetchMock.trpcMutate).toHaveBeenCalledWith(
        'firstRun.configureProvider',
        { modelSpec: 'ollama:qwen2.5:7b' },
      )
      expect(props.onStepComplete).toHaveBeenCalledWith(nextState)
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

  it('assigns the selected model to all seven roles in simple mode', async () => {
    installMock()
    const props = createStepProps()
    const nextState = createFirstRunState({ currentStep: 'complete', complete: true })
    trpcFetchMock.trpcMutate.mockResolvedValue(
      createFirstRunActionResult(nextState),
    )

    render(
      <WizardStepRoleAssignment
        {...props}
        selectedModelSpec="ollama:qwen2.5:7b"
        roleAssignments={{}}
        setRoleAssignments={vi.fn()}
        roleAssignmentMode="default"
        setRoleAssignmentMode={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(trpcFetchMock.trpcMutate).toHaveBeenCalledTimes(1)
      const call = trpcFetchMock.trpcMutate.mock.calls[0]
      expect(call[0]).toBe('firstRun.assignRoles')
      const assignments = call[1]?.assignments ?? []
      expect(assignments).toHaveLength(7)
      expect(assignments.every((entry: { modelSpec: string }) => entry.modelSpec === 'ollama:qwen2.5:7b')).toBe(true)
    })
  })

  it('supports switching to advanced mode and editing per-role assignments', async () => {
    installMock()
    const props = createStepProps()

    function Harness() {
      const [roleAssignments, setRoleAssignments] = useState({})
      const [mode, setMode] = useState<'default' | 'advanced'>('default')

      return (
        <WizardStepRoleAssignment
          {...props}
          selectedModelSpec="ollama:qwen2.5:7b"
          roleAssignments={roleAssignments}
          setRoleAssignments={setRoleAssignments}
          roleAssignmentMode={mode}
          setRoleAssignmentMode={setMode}
        />
      )
    }

    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Advanced mode' }))
    const reasonerSelect = screen.getByLabelText('Reasoner')
    fireEvent.change(reasonerSelect, {
      target: { value: 'ollama:qwen2.5:14b' },
    })

    await waitFor(() => {
      expect((screen.getByLabelText('Reasoner') as HTMLSelectElement).value).toBe(
        'ollama:qwen2.5:14b',
      )
    })
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
