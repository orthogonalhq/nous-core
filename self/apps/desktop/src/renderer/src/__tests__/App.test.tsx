import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  createElectronAPIMock,
  createFirstRunState,
} from '../test-setup'

vi.mock('dockview-react', async () => {
  const React = await import('react')

  return {
    DockviewReact: ({
      onReady,
    }: {
      onReady?: (event: {
        api: {
          panels: never[]
          fromJSON: ReturnType<typeof vi.fn>
          onDidLayoutChange: ReturnType<typeof vi.fn>
          toJSON: ReturnType<typeof vi.fn>
          addPanel: ReturnType<typeof vi.fn>
          removePanel: ReturnType<typeof vi.fn>
        }
      }) => void
    }) => {
      React.useEffect(() => {
        onReady?.({
          api: {
            panels: [],
            fromJSON: vi.fn(),
            onDidLayoutChange: vi.fn(),
            toJSON: vi.fn(() => null),
            addPanel: vi.fn(),
            removePanel: vi.fn(),
          },
        })
      }, [onReady])

      return <div>Dockview shell</div>
    },
  }
})

vi.mock('@nous/ui/panels', () => {
  const Panel = () => null

  return {
    AppIframePanel: Panel,
    PlaceholderPanel: Panel,
    ChatPanel: Panel,
    FileBrowserPanel: Panel,
    NodeProjectionPanel: Panel,
    MAOPanel: Panel,
    CodexBarPanel: Panel,
    CodexBarHeaderActions: Panel,
    DashboardPanel: Panel,
    DashboardWidgetMenu: Panel,
    AgentPanel: Panel,
    PreferencesPanel: Panel,
    useCodexBarApi: () => null,
    useDashboardApi: () => null,
  }
})

vi.mock('../components/AppInstallWizard', () => ({
  AppInstallWizardPanel: () => null,
}))

vi.mock('../components/TitleBar', () => ({
  TitleBar: () => <div>Title bar</div>,
}))

vi.mock('../components/StatusBar', () => ({
  StatusBar: () => <div>Status bar</div>,
}))

vi.mock('../components/FirstRunWizard', () => ({
  FirstRunWizard: ({
    onComplete,
  }: {
    onComplete: () => void
  }) => (
    <div>
      <div>Wizard shell</div>
      <button type="button" onClick={onComplete}>
        Complete wizard
      </button>
    </div>
  ),
}))

import { App } from '../App'

function installMock() {
  const mock = createElectronAPIMock()
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: mock,
  })
  return mock
}

describe('App', () => {
  it('shows the wizard shell when first-run is incomplete', async () => {
    const mock = installMock()
    mock.firstRun.getWizardState.mockResolvedValue(
      createFirstRunState({ complete: false, currentStep: 'ollama_check' }),
    )

    render(<App />)

    expect(await screen.findByText('Wizard shell')).toBeInTheDocument()
  })

  it('shows the dockview shell when first-run is already complete', async () => {
    const mock = installMock()
    mock.firstRun.getWizardState.mockResolvedValue(
      createFirstRunState({
        currentStep: 'complete',
        complete: true,
      }),
    )

    render(<App />)

    expect(await screen.findByText('Dockview shell')).toBeInTheDocument()
  })

  it('transitions from the wizard shell to dockview after completion', async () => {
    const mock = installMock()
    mock.firstRun.getWizardState.mockResolvedValue(
      createFirstRunState({ complete: false, currentStep: 'ollama_check' }),
    )

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Complete wizard' }))

    expect(await screen.findByText('Dockview shell')).toBeInTheDocument()
  })

  it('polls backend readiness before loading first-run state', async () => {
    vi.useFakeTimers()
    const mock = installMock()
    mock.backend.getStatus
      .mockResolvedValueOnce({
        ready: false,
        port: 0,
        trpcUrl: '',
      })
      .mockResolvedValueOnce({
        ready: true,
        port: 4317,
        trpcUrl: 'http://127.0.0.1:4317/trpc',
      })

    render(<App />)

    expect(screen.getByText(/Connecting to backend/)).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(mock.backend.getStatus).toHaveBeenCalledTimes(2)
    expect(mock.firstRun.getWizardState).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Wizard shell')).toBeInTheDocument()

    vi.useRealTimers()
  })

  it('shows an error and retries when loading the first-run state fails', async () => {
    const mock = installMock()
    mock.firstRun.getWizardState
      .mockRejectedValueOnce(new Error('wizard state failed'))
      .mockResolvedValueOnce(createFirstRunState({ complete: false }))

    render(<App />)

    expect(await screen.findByText('wizard state failed')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mock.firstRun.getWizardState).toHaveBeenCalledTimes(2)
    })

    expect(await screen.findByText('Wizard shell')).toBeInTheDocument()
  })
})
