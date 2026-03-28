import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createElectronAPIMock,
  createFirstRunState,
  createPrerequisites,
  DEFAULT_PREREQUISITES,
} from '../../test-setup'
import { FirstRunWizard } from '../FirstRunWizard'

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
      await screen.findByText('Make sure Ollama is installed and running.'),
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
