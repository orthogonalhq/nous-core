import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createElectronAPIMock,
  createFirstRunState,
  DEFAULT_WIZARD_STATE,
} from '../test-setup'

const trpcFetchMock = vi.hoisted(() => ({
  setBackendPort: vi.fn(),
  trpcQuery: vi.fn(),
  trpcMutate: vi.fn(),
}))

const transportMock = vi.hoisted(() => ({
  createDesktopTransport: vi.fn((config: unknown) => config),
  useEventSubscription: vi.fn(),
  useUtils: vi.fn(() => ({
    notifications: {
      countActive: { invalidate: vi.fn() },
    },
    mao: {
      getSystemSnapshot: { invalidate: vi.fn() },
      getProjectSnapshot: { invalidate: vi.fn() },
      getAgentInspectProjection: { invalidate: vi.fn() },
      getProjectControlProjection: { invalidate: vi.fn() },
      getControlAuditHistory: { invalidate: vi.fn() },
    },
    health: {
      systemStatus: { invalidate: vi.fn() },
    },
    escalations: {
      listProjectQueue: { invalidate: vi.fn() },
    },
    tasks: {
      list: { invalidate: vi.fn() },
      get: { invalidate: vi.fn() },
      executions: { invalidate: vi.fn() },
    },
    projects: {
      listWorkflowDefinitions: { invalidate: vi.fn() },
      dashboardSnapshot: { invalidate: vi.fn() },
    },
  })),
  projectListQuery: vi.fn(() => ({ data: [{ id: 'project-1', name: 'Project' }] })),
  projectCreateMutation: vi.fn(() => ({ mutateAsync: vi.fn(async () => ({ id: 'project-1' })) })),
  notificationCountQuery: vi.fn(() => ({ data: 0 })),
}))

vi.mock('../components/wizard/trpc-fetch', () => trpcFetchMock)

vi.mock('@nous/transport', () => {
  return {
    TransportProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
    createDesktopTransport: transportMock.createDesktopTransport,
    useEventSubscription: transportMock.useEventSubscription,
    trpc: {
      useUtils: transportMock.useUtils,
      projects: {
        list: { useQuery: transportMock.projectListQuery },
        create: { useMutation: transportMock.projectCreateMutation },
        listWorkflowDefinitions: { useQuery: vi.fn(() => ({ data: [] })) },
        saveWorkflowSpec: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn() })) },
        renameWorkflowDefinition: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn() })) },
        deleteWorkflowDefinition: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn() })) },
      },
      tasks: {
        list: { useQuery: vi.fn(() => ({ data: [] })) },
        get: { useQuery: vi.fn(() => ({ data: null })) },
        executions: { useQuery: vi.fn(() => ({ data: [] })) },
        create: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn() })) },
        update: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn() })) },
        delete: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn() })) },
        toggle: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn() })) },
        trigger: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn() })) },
      },
      notifications: {
        countActive: { useQuery: transportMock.notificationCountQuery },
      },
      mao: {
        requestProjectControl: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn() })) },
        getSystemSnapshot: { useQuery: vi.fn(() => ({ data: null })) },
        getProjectSnapshot: { useQuery: vi.fn(() => ({ data: null })) },
        getAgentInspectProjection: { useQuery: vi.fn(() => ({ data: null })) },
        getControlAuditHistory: { useQuery: vi.fn(() => ({ data: [] })) },
      },
      health: {
        systemStatus: { useQuery: vi.fn(() => ({ data: null })) },
      },
      escalations: {
        listProjectQueue: { useQuery: vi.fn(() => ({ data: [] })) },
      },
      opctl: {
        requestConfirmationProof: { useMutation: vi.fn(() => ({ mutateAsync: vi.fn() })) },
      },
    },
  }
})

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
    CodexBarPanel: Panel,
    CodexBarHeaderActions: Panel,
    DashboardPanel: Panel,
    DashboardWidgetMenu: Panel,
    AgentPanel: Panel,
    PreferencesPanel: Panel,
    WorkflowBuilderPanel: Panel,
    TaskDetailView: Panel,
    TaskCreateForm: Panel,
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

vi.mock('../desktop-chat-wrappers', () => ({
  DesktopChatPanel: () => <div>Desktop chat panel</div>,
  ConnectedChatSurface: () => <div>Chat surface</div>,
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

    // Default trpc-fetch mock: return incomplete wizard state
    trpcFetchMock.trpcQuery.mockImplementation(async (procedure: string) => {
      if (procedure === 'firstRun.getWizardState') return DEFAULT_WIZARD_STATE
      if (procedure === 'packages.listAppPanels') return []
      return null
    })
    trpcFetchMock.trpcMutate.mockResolvedValue(null)
    trpcFetchMock.setBackendPort.mockClear()
    transportMock.createDesktopTransport.mockClear()
    transportMock.useEventSubscription.mockClear()
    transportMock.useUtils.mockClear()
    transportMock.projectListQuery.mockClear()
    transportMock.projectCreateMutation.mockClear()
    transportMock.notificationCountQuery.mockClear()
  })

  it('starts in simple mode by default', async () => {
    const mock = installMock()
    trpcFetchMock.trpcQuery.mockImplementation(async (procedure: string) => {
      if (procedure === 'firstRun.getWizardState') return createFirstRunState({ currentStep: 'complete', complete: true })
      if (procedure === 'packages.listAppPanels') return []
      return null
    })

    render(<App />)

    await waitFor(() => {
      expect(document.querySelector('[data-shell-area="rail"]')).not.toBeNull()
    })

    // HomeScreen renders a greeting (time-dependent)
    expect(
      screen.getByText(/Good (morning|afternoon|evening), User/),
    ).toBeInTheDocument()
    // Observe column renders (ObservePanel default view text)
    expect(screen.getByText('No observe content for this view')).toBeInTheDocument()
    expect(screen.queryByText('Dockview shell')).not.toBeInTheDocument()
    expect(screen.queryByText('Status bar')).not.toBeInTheDocument()
    const chat = document.querySelector('[data-shell-area="chat"]') as HTMLElement | null
    expect(chat?.dataset.chatOwner).toBe('Cortex:Principal')
    expect(chat?.dataset.chatContainer).toBe('principal-drawer')
    expect(chat?.getAttribute('aria-label')).toBe('Cortex Principal chat drawer')
    expect(mock.mode.get).toHaveBeenCalledTimes(1)
  })

  it('loads developer mode from persisted state', async () => {
    const mock = installMock()
    trpcFetchMock.trpcQuery.mockImplementation(async (procedure: string) => {
      if (procedure === 'firstRun.getWizardState') return createFirstRunState({ currentStep: 'complete', complete: true })
      if (procedure === 'packages.listAppPanels') return []
      return null
    })
    mock.mode.get.mockResolvedValue('developer')

    render(<App />)

    expect(await screen.findByText('Dockview shell')).toBeInTheDocument()
    expect(screen.getByText('Status bar')).toBeInTheDocument()
    expect(document.querySelector('[data-chat-container="principal-drawer"]')).toBeNull()
    expect(mock.mode.get).toHaveBeenCalledTimes(1)
  })

  it('toggles mode with the keyboard shortcut and persists the change', async () => {
    const mock = installMock()
    trpcFetchMock.trpcQuery.mockImplementation(async (procedure: string) => {
      if (procedure === 'firstRun.getWizardState') return createFirstRunState({ currentStep: 'complete', complete: true })
      if (procedure === 'packages.listAppPanels') return []
      return null
    })

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
    trpcFetchMock.trpcQuery.mockImplementation(async (procedure: string) => {
      if (procedure === 'firstRun.getWizardState') return createFirstRunState({ currentStep: 'complete', complete: true })
      if (procedure === 'packages.listAppPanels') return []
      return null
    })

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
    mock.mode.get.mockResolvedValue('developer')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const circularLayout: Record<string, unknown> = {}
    circularLayout.self = circularLayout

    trpcFetchMock.trpcQuery.mockImplementation(async (procedure: string) => {
      if (procedure === 'firstRun.getWizardState') return createFirstRunState({ currentStep: 'complete', complete: true })
      if (procedure === 'packages.listAppPanels') return []
      return null
    })
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
    mock.mode.get.mockResolvedValue('developer')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const syncError = new Error('An object could not be cloned')

    trpcFetchMock.trpcQuery.mockImplementation(async (procedure: string) => {
      if (procedure === 'firstRun.getWizardState') return createFirstRunState({ currentStep: 'complete', complete: true })
      if (procedure === 'packages.listAppPanels') return []
      return null
    })
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
    installMock()
    // Default trpcQuery mock returns incomplete wizard state

    render(<App />)

    expect(await screen.findByText('Wizard shell')).toBeInTheDocument()
  })

  it('shows the dockview shell when first-run is already complete', async () => {
    const mock = installMock()
    mock.mode.get.mockResolvedValue('developer')
    trpcFetchMock.trpcQuery.mockImplementation(async (procedure: string) => {
      if (procedure === 'firstRun.getWizardState') return createFirstRunState({ currentStep: 'complete', complete: true })
      if (procedure === 'packages.listAppPanels') return []
      return null
    })

    render(<App />)

    expect(await screen.findByText('Dockview shell')).toBeInTheDocument()
  })

  it('transitions from the wizard shell to dockview after completion', async () => {
    const mock = installMock()
    mock.mode.get.mockResolvedValue('developer')
    // Default trpcQuery mock returns incomplete wizard state

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
    expect(trpcFetchMock.trpcQuery).toHaveBeenCalled()
    expect(screen.getByText('Wizard shell')).toBeInTheDocument()

    vi.useRealTimers()
  })

  it('shows an error and retries when loading the first-run state fails', async () => {
    installMock()
    let callCount = 0
    trpcFetchMock.trpcQuery.mockImplementation(async (procedure: string) => {
      if (procedure === 'firstRun.getWizardState') {
        callCount++
        if (callCount === 1) throw new Error('wizard state failed')
        return createFirstRunState({ complete: false })
      }
      if (procedure === 'packages.listAppPanels') return []
      return null
    })

    render(<App />)

    expect(await screen.findByText('wizard state failed')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(callCount).toBeGreaterThanOrEqual(2)
    })

    expect(await screen.findByText('Wizard shell')).toBeInTheDocument()
  })

  it('wires the preferences panel reset callback back into app initialization', async () => {
    const mock = installMock()
    mock.mode.get.mockResolvedValue('developer')
    let wizardCallCount = 0
    trpcFetchMock.trpcQuery.mockImplementation(async (procedure: string) => {
      if (procedure === 'firstRun.getWizardState') {
        wizardCallCount++
        if (wizardCallCount === 1) return createFirstRunState({ currentStep: 'complete', complete: true })
        return createFirstRunState({ currentStep: 'ollama_check', complete: false })
      }
      if (procedure === 'packages.listAppPanels') return []
      return null
    })

    render(<App />)

    expect(await screen.findByText('Dockview shell')).toBeInTheDocument()

    const preferencesPanelCall = dockviewApiMock.addPanel.mock.calls.find(
      ([panel]) => panel.id === 'preferences',
    )
    expect(preferencesPanelCall).toBeTruthy()

    const preferencesParams = preferencesPanelCall?.[0].params as {
      onWizardReset?: () => Promise<void> | void
    }

    await act(async () => {
      await preferencesParams.onWizardReset?.()
    })

    await waitFor(() => {
      expect(wizardCallCount).toBeGreaterThanOrEqual(2)
    })

    expect(await screen.findByText('Wizard shell')).toBeInTheDocument()
  })

  it('opens command palette with Ctrl+K', async () => {
    installMock()
    trpcFetchMock.trpcQuery.mockImplementation(async (procedure: string) => {
      if (procedure === 'firstRun.getWizardState') return createFirstRunState({ currentStep: 'complete', complete: true })
      if (procedure === 'packages.listAppPanels') return []
      return null
    })

    render(<App />)

    await waitFor(() => {
      expect(document.querySelector('[data-shell-area="rail"]')).not.toBeNull()
    })

    // Command palette should not be visible initially
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument()

    // Press Ctrl+K
    fireEvent.keyDown(window, {
      ctrlKey: true,
      key: 'k',
    })

    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
  })

  it('closes command palette with Escape', async () => {
    installMock()
    trpcFetchMock.trpcQuery.mockImplementation(async (procedure: string) => {
      if (procedure === 'firstRun.getWizardState') return createFirstRunState({ currentStep: 'complete', complete: true })
      if (procedure === 'packages.listAppPanels') return []
      return null
    })

    render(<App />)

    await waitFor(() => {
      expect(document.querySelector('[data-shell-area="rail"]')).not.toBeNull()
    })

    // Open with Ctrl+K
    fireEvent.keyDown(window, {
      ctrlKey: true,
      key: 'k',
    })

    const dialog = screen.getByRole('dialog', { name: 'Command palette' })
    expect(dialog).toBeInTheDocument()

    // Press Escape inside the palette
    fireEvent.keyDown(dialog, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument()
    })
  })

  it('navigates via command palette', async () => {
    installMock()
    trpcFetchMock.trpcQuery.mockImplementation(async (procedure: string) => {
      if (procedure === 'firstRun.getWizardState') return createFirstRunState({ currentStep: 'complete', complete: true })
      if (procedure === 'packages.listAppPanels') return []
      return null
    })

    render(<App />)

    await waitFor(() => {
      expect(document.querySelector('[data-shell-area="rail"]')).not.toBeNull()
    })

    // Open command palette
    fireEvent.keyDown(window, {
      ctrlKey: true,
      key: 'k',
    })

    // Click "Go to Threads" command
    const threadsCommand = screen.getByTestId('command-item-nav-threads')
    fireEvent.click(threadsCommand)

    // Palette should close after executing command
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument()
    })
  })
})
