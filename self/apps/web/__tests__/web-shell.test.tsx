// @vitest-environment jsdom

import * as React from 'react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, act } from '@testing-library/react'

// ─── Capture refs for mock props ────────────────────────────────────────────

let capturedShellProviderProps: Record<string, unknown> = {}
let capturedChromeShellProps: Record<string, unknown> = {}
let capturedNavigationRailProps: Record<string, unknown> = {}
let capturedContentRouterProps: Record<string, unknown> = {}
let capturedCommandPaletteProps: Record<string, unknown> = {}

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@nous/ui/hooks/useTasks', () => ({
  useTasks: () => ({
    tasks: [],
    tasksLoading: false,
    tasksError: null,
    activeTask: null,
    activeTaskLoading: false,
    activeTaskError: null,
    loadTask: vi.fn(),
    executions: [],
    executionsLoading: false,
    executionsError: null,
    loadExecutions: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    toggleTask: vi.fn(),
    triggerTask: vi.fn(),
  }),
  buildTasksSection: () => ({
    id: 'tasks',
    label: 'TASKS',
    items: [],
    collapsible: true,
    disabled: false,
  }),
}))

vi.mock('@nous/ui/components', () => ({
  ShellProvider: (props: any) => {
    capturedShellProviderProps = props
    return React.createElement('div', { 'data-testid': 'shell-provider', 'data-mode': props.mode, 'data-active-route': props.activeRoute }, props.children)
  },
  useShellContext: () => ({
    activeProjectId: null,
    activeRoute: 'home',
    navigate: vi.fn(),
    goBack: vi.fn(),
    mode: 'simple',
    breakpoint: 'full',
    navigation: { activeRoute: 'home', history: ['home'], canGoBack: false },
    conversation: { tier: 'transient', threadId: null, projectId: null, isAmbient: true },
  }),
  ShellLayout: (props: any) => {
    return React.createElement('div', { 'data-testid': 'shell-layout' }, props.rail, props.chat, props.content, props.observe)
  },
  SimpleShellLayout: (props: any) => {
    const chat = typeof props.chatSlot === 'function' ? props.chatSlot({ stage: 'small', onStageChange: () => {} }) : null
    return React.createElement('div', { 'data-testid': 'simple-shell-layout' }, props.projectRail, props.sidebar, props.content, props.observe, chat)
  },
  NavigationRail: (props: any) => {
    capturedNavigationRailProps = props
    return React.createElement('div', { 'data-testid': 'navigation-rail', 'data-active-item': props.activeItemId })
  },
  ContentRouter: (props: any) => {
    capturedContentRouterProps = props
    return React.createElement('div', { 'data-testid': 'content-router', 'data-active-route': props.activeRoute })
  },
  ProjectSwitcherRail: (props: any) => {
    return React.createElement('div', { 'data-testid': 'project-switcher-rail', 'data-active-project': props.activeProjectId })
  },
  AssetSidebar: (props: any) => {
    return React.createElement('div', { 'data-testid': 'asset-sidebar', 'data-active-route': props.activeRoute },
      typeof props.chatSlot === 'function' ? props.chatSlot({ stage: 'small', onStageChange: () => {} }) : null
    )
  },
  CollapsibleObserveEdge: (props: any) => {
    return React.createElement('div', { 'data-testid': 'collapsible-observe-edge' }, props.children)
  },
  ChatSurface: () => React.createElement('div', { 'data-testid': 'chat-surface' }),
  ObservePanel: () => React.createElement('div', { 'data-testid': 'observe-panel' }),
  useChatStageManager: () => ({
    chatStage: 'small',
    signalSending: vi.fn(),
    signalInferenceStart: vi.fn(),
    signalPfcDecision: vi.fn(),
    signalTurnComplete: vi.fn(),
    expandToAmbientLarge: vi.fn(),
    expandToFull: vi.fn(),
    collapseToAmbientSmall: vi.fn(),
    minimizeToAmbientLarge: vi.fn(),
    collapseToSmall: vi.fn(),
    handleClickOutside: vi.fn(),
  }),
  CommandPalette: (props: any) => {
    capturedCommandPaletteProps = props
    if (!props.isOpen) return null
    return React.createElement('div', { 'data-testid': 'command-palette' })
  },
}))

vi.mock('@nous/transport', () => ({
  useChatApi: () => ({ send: vi.fn(), getHistory: vi.fn().mockResolvedValue([]) }),
  useEventSubscription: () => {},
  trpc: {
    projects: {
      list: { useQuery: () => ({ data: [], isLoading: false, error: null }) },
    },
    tasks: {
      list: { useQuery: () => ({ data: [], isLoading: false, error: null }) },
      get: { useQuery: () => ({ data: null, isLoading: false, error: null }) },
      executions: { useQuery: () => ({ data: [], isLoading: false, error: null }) },
      create: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      update: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      delete: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      toggle: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      trigger: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
    useUtils: () => ({
      tasks: {
        list: { invalidate: vi.fn() },
        get: { invalidate: vi.fn() },
        executions: { invalidate: vi.fn() },
      },
    }),
  },
}))

vi.mock('@/components/shell/web-chat-wrappers', () => ({
  WebConnectedChatSurface: () => React.createElement('div', { 'data-testid': 'web-connected-chat-surface' }),
}))

vi.mock('next/dynamic', () => ({
  default: (_loader: () => Promise<any>, _options?: any) => {
    function DynamicWebDockviewShell() {
      return React.createElement('div', { 'data-testid': 'web-dockview-shell' })
    }
    DynamicWebDockviewShell.displayName = 'DynamicWebDockviewShell'
    return DynamicWebDockviewShell
  },
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

vi.mock('@/lib/project-context', () => ({
  ProjectProvider: ({ children, value }: any) => {
    return React.createElement('div', { 'data-testid': 'project-provider', 'data-project-id': value.projectId ?? '' }, children)
  },
}))

vi.mock('@/components/shell/web-chrome-shell', () => ({
  WebChromeShell: (props: any) => {
    capturedChromeShellProps = props
    return React.createElement('div', {
      'data-testid': 'web-chrome-shell',
      'data-shell-mode': props.mode,
    }, props.children)
  },
}))

vi.mock('@/components/shell/web-rail-config', () => ({
  webRailSections: [{ id: 'main', label: 'Navigate', items: [{ id: 'home', label: 'Home', icon: 'H' }] }],
}))

vi.mock('@/components/shell/web-sidebar-config', () => ({
  WEB_TOP_NAV: [
    { id: 'dashboard', label: 'Dashboard', icon: 'D', routeId: 'dashboard' },
  ],
  buildWebSidebarSections: () => [
    { id: 'workflows', label: 'WORKFLOWS', items: [], collapsible: true, disabled: false },
  ],
}))

vi.mock('@/components/shell/web-shell-routes', () => ({
  createWebShellRoutes: () => ({ home: () => React.createElement('div', null, 'Home') }),
}))

vi.mock('@/components/shell/web-command-config', () => ({
  buildWebCommands: (cbs: any) => [{ id: 'test', label: 'Test', commands: [] }],
}))

vi.mock('@/components/shell/web-panel-defs', () => ({
  WEB_PANEL_DEFS: [
    { id: 'chat', component: 'chat', title: 'Chat' },
    { id: 'mao', component: 'mao', title: 'MAO' },
  ],
  DEFAULT_POSITIONS: { mao: { direction: 'below', referencePanel: 'chat' } },
  PANEL_ADD_ORDER: ['chat', 'mao'],
}))

// ─── Import under test (after mocks) ────────────────────────────────────────

import ShellLayout from '@/app/(shell)/layout'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderShell(childContent?: React.ReactNode) {
  return render(
    <ShellLayout>
      {childContent ?? <div data-testid="child-page">Page Content</div>}
    </ShellLayout>,
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Web Shell Integration', () => {
  beforeEach(() => {
    capturedShellProviderProps = {}
    capturedChromeShellProps = {}
    capturedNavigationRailProps = {}
    capturedContentRouterProps = {}
    capturedCommandPaletteProps = {}
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders in simple mode by default', () => {
    renderShell()
    const chrome = screen.getByTestId('web-chrome-shell')
    expect(chrome.getAttribute('data-shell-mode')).toBe('simple')
    expect(screen.getByTestId('simple-shell-layout')).toBeDefined()
    expect(screen.queryByTestId('web-dockview-shell')).toBeNull()
  })

  it('toggles mode when onModeToggle is called', () => {
    renderShell()
    expect(screen.getByTestId('web-chrome-shell').getAttribute('data-shell-mode')).toBe('simple')

    // Trigger mode toggle via the captured WebChromeShell prop
    act(() => {
      ;(capturedChromeShellProps.onModeToggle as () => void)()
    })

    expect(screen.getByTestId('web-chrome-shell').getAttribute('data-shell-mode')).toBe('developer')
    expect(screen.getByTestId('web-dockview-shell')).toBeDefined()
    expect(screen.queryByTestId('simple-shell-layout')).toBeNull()
  })

  it('persists mode to localStorage on toggle', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    renderShell()

    act(() => {
      ;(capturedChromeShellProps.onModeToggle as () => void)()
    })

    expect(setItemSpy).toHaveBeenCalledWith('nous:shell-mode', 'developer')
  })

  it('loads persisted mode from localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('developer')
    renderShell()

    // useEffect fires after render
    expect(screen.getByTestId('web-chrome-shell').getAttribute('data-shell-mode')).toBe('developer')
  })

  it('navigates when ContentRouter onNavigate is called', () => {
    renderShell()
    expect(capturedContentRouterProps.activeRoute).toBe('home')

    act(() => {
      ;(capturedContentRouterProps.onNavigate as (id: string) => void)('dashboard')
    })

    expect(capturedContentRouterProps.activeRoute).toBe('dashboard')
  })

  it('opens command palette on Ctrl+K', () => {
    renderShell()
    expect(screen.queryByTestId('command-palette')).toBeNull()

    act(() => {
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    })

    expect(screen.getByTestId('command-palette')).toBeDefined()
  })

  it('toggles mode on Ctrl+Shift+D', () => {
    renderShell()
    expect(screen.getByTestId('web-chrome-shell').getAttribute('data-shell-mode')).toBe('simple')

    act(() => {
      fireEvent.keyDown(document, { key: 'd', ctrlKey: true, shiftKey: true })
    })

    expect(screen.getByTestId('web-chrome-shell').getAttribute('data-shell-mode')).toBe('developer')
  })

  it('renders new layout components in simple mode', () => {
    renderShell()
    expect(screen.getByTestId('simple-shell-layout')).toBeDefined()
    expect(screen.getByTestId('project-switcher-rail')).toBeDefined()
    expect(screen.getByTestId('asset-sidebar')).toBeDefined()
    expect(screen.getByTestId('content-router')).toBeDefined()
    expect(screen.getByTestId('observe-panel')).toBeDefined()
    expect(screen.getByTestId('web-connected-chat-surface')).toBeDefined()
  })

  it('renders children page outlet', () => {
    renderShell(<div data-testid="child-page">Page Content</div>)
    expect(screen.getByTestId('child-page')).toBeDefined()
    expect(screen.getByTestId('child-page').textContent).toBe('Page Content')
  })

  it('provides correct props to ShellProvider', () => {
    renderShell()
    expect(capturedShellProviderProps.mode).toBe('simple')
    expect(capturedShellProviderProps.activeRoute).toBe('home')
    expect(capturedShellProviderProps.navigation).toEqual({
      activeRoute: 'home',
      history: ['home'],
      canGoBack: false,
    })
    expect(typeof capturedShellProviderProps.navigate).toBe('function')
    expect(typeof capturedShellProviderProps.goBack).toBe('function')
    expect(capturedShellProviderProps.activeProjectId).toBeNull()
  })

  it('renders WebChromeShell as the outermost shell', () => {
    renderShell()
    expect(screen.getByTestId('web-chrome-shell')).toBeDefined()
  })

  it('passes panelDefs to WebChromeShell', () => {
    renderShell()
    expect(capturedChromeShellProps.panelDefs).toEqual([
      { id: 'chat', component: 'chat', title: 'Chat' },
      { id: 'mao', component: 'mao', title: 'MAO' },
    ])
  })

  it('passes null dockviewApi in simple mode', () => {
    renderShell()
    expect(capturedChromeShellProps.dockviewApi).toBeNull()
  })
})
