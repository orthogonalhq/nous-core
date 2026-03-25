import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

  it('shows download guidance when Ollama is not installed', () => {
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

    expect(screen.getByRole('link', { name: 'Download Ollama' })).toBeInTheDocument()
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
    const mock = installMock()
    const props = createStepProps()

    render(
      <WizardStepOllamaSetup
        {...props}
        ollamaStatus={createPrerequisites().ollama}
        refreshOllamaStatus={vi.fn(async () => {})}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(mock.firstRun.completeStep).toHaveBeenCalledWith('ollama_check')
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
    mock.firstRun.downloadModel.mockResolvedValue(
      createFirstRunActionResult(nextState),
    )
    mock.firstRun.configureProvider.mockResolvedValue(
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
      expect(mock.firstRun.downloadModel).toHaveBeenCalledWith('qwen2.5:7b')
      expect(mock.firstRun.configureProvider).toHaveBeenCalledWith('ollama:qwen2.5:7b')
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
    const mock = installMock()
    const props = createStepProps()

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
      expect(mock.firstRun.assignRoles).toHaveBeenCalledTimes(1)
      const assignments = mock.firstRun.assignRoles.mock.calls[0]?.[0] ?? []
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
          orchestrator: 'ollama:qwen2.5:7b',
          reasoner: 'ollama:qwen2.5:14b',
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
