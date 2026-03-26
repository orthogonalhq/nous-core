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

vi.mock('@nous/ui/components', () => ({
  ShellProvider: (props: any) => {
    capturedShellProviderProps = props
    return React.createElement('div', { 'data-testid': 'shell-provider', 'data-mode': props.mode, 'data-active-route': props.activeRoute }, props.children)
  },
  ShellLayout: (props: any) => {
    return React.createElement('div', { 'data-testid': 'shell-layout' }, props.rail, props.chat, props.content, props.observe)
  },
  NavigationRail: (props: any) => {
    capturedNavigationRailProps = props
    return React.createElement('div', { 'data-testid': 'navigation-rail', 'data-active-item': props.activeItemId })
  },
  ContentRouter: (props: any) => {
    capturedContentRouterProps = props
    return React.createElement('div', { 'data-testid': 'content-router', 'data-active-route': props.activeRoute })
  },
  ChatSurface: () => React.createElement('div', { 'data-testid': 'chat-surface' }),
  ObservePanel: () => React.createElement('div', { 'data-testid': 'observe-panel' }),
  CommandPalette: (props: any) => {
    capturedCommandPaletteProps = props
    if (!props.isOpen) return null
    return React.createElement('div', { 'data-testid': 'command-palette' })
  },
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

const mockMutateAsync = vi.fn().mockResolvedValue({ id: 'new-proj-1', name: 'Test' })
const mockInvalidate = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      projects: { list: { invalidate: mockInvalidate } },
    }),
    projects: {
      create: { useMutation: (opts: any) => ({ mutateAsync: mockMutateAsync, ...opts }) },
      list: { useQuery: () => ({ data: [{ id: 'proj-1', name: 'Alpha' }, { id: 'proj-2', name: 'Beta' }] }) },
    },
  },
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
  webRailSections: [{ id: 'main', label: 'Main', items: [{ id: 'home', label: 'Home', icon: 'H' }] }],
}))

vi.mock('@/components/shell/web-shell-routes', () => ({
  webShellRoutes: { home: () => React.createElement('div', null, 'Home') },
}))

vi.mock('@/components/shell/web-command-config', () => ({
  buildWebCommands: (cbs: any) => [{ id: 'test', label: 'Test', commands: [] }],
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
    expect(screen.getByTestId('shell-layout')).toBeDefined()
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
    expect(screen.queryByTestId('shell-layout')).toBeNull()
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

  it('navigates when rail onItemSelect is called', () => {
    renderShell()
    expect(capturedContentRouterProps.activeRoute).toBe('home')

    act(() => {
      ;(capturedNavigationRailProps.onItemSelect as (id: string) => void)('chat')
    })

    expect(capturedContentRouterProps.activeRoute).toBe('chat')
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

  it('renders ChatSurface in simple mode', () => {
    renderShell()
    expect(screen.getByTestId('chat-surface')).toBeDefined()
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
})
