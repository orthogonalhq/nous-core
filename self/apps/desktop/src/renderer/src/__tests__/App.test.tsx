import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createElectronAPIMock,
  createFirstRunState,
} from '../test-setup'

const dockviewApiMock = vi.hoisted(() => ({
  panels: [] as never[],
  fromJSON: vi.fn(),
  onDidLayoutChange: vi.fn(),
  toJSON: vi.fn((): unknown => null),
  addPanel: vi.fn(),
  removePanel: vi.fn(),
}))

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
          api: dockviewApiMock,
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
  beforeEach(() => {
    dockviewApiMock.fromJSON.mockClear()
    dockviewApiMock.onDidLayoutChange.mockClear()
    dockviewApiMock.toJSON.mockClear()
    dockviewApiMock.addPanel.mockClear()
    dockviewApiMock.removePanel.mockClear()
    dockviewApiMock.panels.length = 0
    window.localStorage.clear()
  })

  it('starts in simple mode by default', async () => {
    const mock = installMock()
    mock.firstRun.getWizardState.mockResolvedValue(
      createFirstRunState({
        currentStep: 'complete',
        complete: true,
      }),
    )

    render(<App />)

    await waitFor(() => {
      expect(document.querySelector('[data-shell-area="rail"]')).not.toBeNull()
    })

    expect(screen.getByText('Chat placeholder')).toBeInTheDocument()
    expect(screen.getByText('Observe placeholder')).toBeInTheDocument()
    expect(screen.getByText('Content placeholder')).toBeInTheDocument()
    expect(screen.queryByText('Dockview shell')).not.toBeInTheDocument()
    expect(mock.mode.get).toHaveBeenCalledTimes(1)
  })

  it('loads developer mode from persisted state', async () => {
    const mock = installMock()
    mock.firstRun.getWizardState.mockResolvedValue(
      createFirstRunState({
        currentStep: 'complete',
        complete: true,
      }),
    )
    mock.mode.get.mockResolvedValue('developer')

    render(<App />)

    expect(await screen.findByText('Dockview shell')).toBeInTheDocument()
    expect(mock.mode.get).toHaveBeenCalledTimes(1)
  })

  it('toggles mode with the keyboard shortcut and persists the change', async () => {
    const mock = installMock()
    mock.firstRun.getWizardState.mockResolvedValue(
      createFirstRunState({
        currentStep: 'complete',
        complete: true,
      }),
    )

    render(<App />)

    await waitFor(() => {
      expect(document.querySelector('[data-shell-area="rail"]')).not.toBeNull()
    })

    fireEvent.keyDown(window, {
      ctrlKey: true,
      shiftKey: true,
      key: 'D',
    })

    expect(await screen.findByText('Dockview shell')).toBeInTheDocument()
    expect(mock.mode.set).toHaveBeenCalledWith('developer')
  })

  it('falls back to localStorage when the mode bridge is unavailable', async () => {
    const mock = installMock()
    mock.firstRun.getWizardState.mockResolvedValue(
      createFirstRunState({
        currentStep: 'complete',
        complete: true,
      }),
    )

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: {
        ...mock,
        mode: undefined,
      },
    })

    window.localStorage.setItem('nous:shell-mode', 'developer')

    render(<App />)

    expect(await screen.findByText('Dockview shell')).toBeInTheDocument()

    fireEvent.keyDown(window, {
      ctrlKey: true,
      shiftKey: true,
      key: 'D',
    })

    await waitFor(() => {
      expect(document.querySelector('[data-shell-area="rail"]')).not.toBeNull()
    })

    expect(window.localStorage.getItem('nous:shell-mode')).toBe('simple')
  })

  it('skips persisting the layout when serialization fails', async () => {
    const mock = installMock()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const circularLayout: Record<string, unknown> = {}
    circularLayout.self = circularLayout

    mock.firstRun.getWizardState.mockResolvedValue(
      createFirstRunState({
        currentStep: 'complete',
        complete: true,
      }),
    )
    dockviewApiMock.toJSON.mockReturnValue(circularLayout)

    render(<App />)

    expect(await screen.findByText('Dockview shell')).toBeInTheDocument()
    await waitFor(() => {
      expect(dockviewApiMock.onDidLayoutChange).toHaveBeenCalled()
    })

    try {
      const onDidLayoutChange = dockviewApiMock.onDidLayoutChange.mock.calls[0]?.[0] as
        | (() => void)
        | undefined
      expect(onDidLayoutChange).toBeTruthy()

      onDidLayoutChange?.()

      expect(mock.layout.set).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledWith(
        'Layout serialization failed, skipping save',
        expect.any(TypeError),
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('catches synchronous layout persistence errors without crashing', async () => {
    const mock = installMock()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const syncError = new Error('An object could not be cloned')

    mock.firstRun.getWizardState.mockResolvedValue(
      createFirstRunState({
        currentStep: 'complete',
        complete: true,
      }),
    )
    dockviewApiMock.toJSON.mockReturnValue({ panels: [] })
    mock.layout.set.mockImplementationOnce(() => {
      throw syncError
    })

    render(<App />)

    expect(await screen.findByText('Dockview shell')).toBeInTheDocument()
    await waitFor(() => {
      expect(dockviewApiMock.onDidLayoutChange).toHaveBeenCalled()
    })

    try {
      const onDidLayoutChange = dockviewApiMock.onDidLayoutChange.mock.calls[0]?.[0] as
        | (() => void)
        | undefined
      expect(onDidLayoutChange).toBeTruthy()

      expect(() => onDidLayoutChange?.()).not.toThrow()
      expect(mock.layout.set).toHaveBeenCalledWith({ panels: [] })
      expect(errorSpy).toHaveBeenCalledWith('Layout save failed', syncError)
    } finally {
      errorSpy.mockRestore()
    }
  })

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

  it('wires the preferences panel reset callback back into app initialization', async () => {
    const mock = installMock()
    mock.firstRun.getWizardState
      .mockResolvedValueOnce(
        createFirstRunState({
          currentStep: 'complete',
          complete: true,
        }),
      )
      .mockResolvedValueOnce(
        createFirstRunState({
          currentStep: 'ollama_check',
          complete: false,
        }),
      )

    render(<App />)

    expect(await screen.findByText('Dockview shell')).toBeInTheDocument()

    const preferencesPanelCall = dockviewApiMock.addPanel.mock.calls.find(
      ([panel]) => panel.id === 'preferences',
    )
    expect(preferencesPanelCall).toBeTruthy()

    const preferencesParams = preferencesPanelCall?.[0].params as {
      preferencesApi?: { resetWizard?: () => Promise<unknown> }
      onWizardReset?: () => Promise<void> | void
    }

    expect(preferencesParams.preferencesApi?.resetWizard).toBe(mock.firstRun.resetWizard)

    await act(async () => {
      await preferencesParams.onWizardReset?.()
    })

    await waitFor(() => {
      expect(mock.firstRun.getWizardState).toHaveBeenCalledTimes(2)
    })

    expect(await screen.findByText('Wizard shell')).toBeInTheDocument()
  })
})
