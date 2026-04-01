import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { DockviewReact } from 'dockview-react'
import type {
  DockviewApi,
  DockviewReadyEvent,
  SerializedDockview,
  IDockviewHeaderActionsProps,
} from 'dockview-react'
import {
  CodexBarHeaderActions,
  useCodexBarApi,
  DashboardWidgetMenu,
  useDashboardApi,
  PreferencesPanel,
} from '@nous/ui/panels'
import {
  ContentRouter,
  NavigationRail,
  ShellLayout,
  SimpleShellLayout,
  ShellProvider,
  useShellContext as useShellCtx,
  ObservePanel,
  CommandPalette,
  ProjectSwitcherRail,
  AssetSidebar,
  CollapsibleObserveEdge,
  type ContentRouterRenderProps,
  type ShellMode,
  type CommandGroup,
  type ChatStage,
} from '@nous/ui/components'
import { TransportProvider, createDesktopTransport, trpc } from '@nous/transport'
import { FirstRunWizard } from './components/FirstRunWizard'
import { TitleBar } from './components/TitleBar'
import { StatusBar } from './components/StatusBar'
import type { FirstRunState } from './components/wizard/types'
import { setBackendPort as setWizardBackendPort, trpcQuery } from './components/wizard/trpc-fetch'
import { ConnectedChatSurface } from './desktop-chat-wrappers'
import { panelComponents } from './desktop-panel-map'
import { RAIL_SECTIONS } from './desktop-rail-config'
import { buildDesktopCommands } from './desktop-command-config'
import { DESKTOP_TOP_NAV, buildDesktopSidebarSections } from './desktop-sidebar-config'
import { BASE_SIMPLE_MODE_ROUTES } from './desktop-routes'
import { SettingsRoute } from './desktop-settings-route'

import 'dockview-react/dist/styles/dockview.css'

// Single source of truth for all panels — used by initDefaultLayout() and View menu toggle
export type PanelDef = {
  id: string
  component: string
  title: string
  params?: () => Record<string, unknown>
  position?: { direction: string; referencePanel: string }
}

interface AppPanelSnapshot {
  app_id: string
  panel_id: string
  label: string
  route_path: string
  dockview_panel_id: string
  config_version: string
  preserve_state: boolean
  position?: 'left' | 'right' | 'bottom' | 'main'
  config_snapshot: Record<string, {
    value: unknown
    source: 'manifest_default' | 'project_config' | 'system'
  }>
  src: string
}

const APP_PANEL_POSITIONS: Record<NonNullable<AppPanelSnapshot['position']>, { direction: string; referencePanel: string }> = {
  left: { direction: 'left', referencePanel: 'chat' },
  right: { direction: 'right', referencePanel: 'chat' },
  bottom: { direction: 'below', referencePanel: 'chat' },
  main: { direction: 'within', referencePanel: 'chat' },
}

// ─── Panel registry ──────────────────────────────────────────────────────────
// Panels that resolve live API bridges from window.electronAPI at render time.
// The params factory is invoked both when adding a panel and after layout restore.

export const NATIVE_PANEL_DEFS: PanelDef[] = [
  {
    id: 'chat',
    component: 'chat',
    title: 'Principal \u2194 Cortex',
  },
  {
    id: 'app-installer',
    component: 'app-installer',
    title: 'App Installer',
  },
  {
    id: 'files',
    component: 'file-browser',
    title: 'Files',
    params: () => ({ fsApi: window.electronAPI?.fs, initialPath: '/' }),
  },
  { id: 'node-projection', component: 'node-projection', title: 'Skill Projection' },
  { id: 'mao', component: 'mao', title: 'MAO' },
  {
    id: 'codexbar',
    component: 'codexbar',
    title: 'AI Usage',
    params: () => ({ usageApi: window.electronAPI?.usage }),
  },
  { id: 'dashboard', component: 'dashboard', title: 'Dashboard' },
  { id: 'coding-agents', component: 'coding-agents', title: 'Coding Agents' },
  { id: 'workflow-builder', component: 'workflow-builder', title: 'Workflow Builder' },
  {
    id: 'preferences',
    component: 'preferences',
    title: 'Preferences',
  },
]

// Order in which panels are added to the default layout.
// Panels that are referenced by others must appear first.
// chat is the anchor — everything else positions relative to it.
const PANEL_ADD_ORDER = [
  'chat',
  'files',
  'node-projection',
  'mao',
  'app-installer',
  'codexbar',
  'dashboard',
  'coding-agents',
  'preferences',
  'workflow-builder',
]

const DEFAULT_ROUTE = 'home'
const MODE_STORAGE_KEY = 'nous:shell-mode'


function parseShellMode(value: unknown): ShellMode | null {
  return value === 'simple' || value === 'developer' ? value : null
}

const modePersistence = {
  get: async (): Promise<ShellMode | null> => {
    try {
      if (typeof window.electronAPI?.mode?.get === 'function') {
        return parseShellMode(await window.electronAPI.mode.get())
      }

      return parseShellMode(window.localStorage.getItem(MODE_STORAGE_KEY))
    } catch {
      console.warn('[nous:mode] Failed to load mode, defaulting to simple')
      return null
    }
  },
  set: async (mode: ShellMode): Promise<void> => {
    try {
      if (typeof window.electronAPI?.mode?.set === 'function') {
        await window.electronAPI.mode.set(mode)
        return
      }

      window.localStorage.setItem(MODE_STORAGE_KEY, mode)
    } catch {
      console.warn('[nous:mode] Failed to save mode')
    }
  },
}

type PreferencesPanelParams = Parameters<typeof PreferencesPanel>[0]['params']

function toAppPanelDef(panel: AppPanelSnapshot): PanelDef {
  return {
    id: panel.dockview_panel_id,
    component: 'app-iframe',
    title: panel.label,
    params: () => ({
      appId: panel.app_id,
      panelId: panel.panel_id,
      src: panel.src,
      preserveState: panel.preserve_state,
      configVersion: panel.config_version,
      configSnapshot: panel.config_snapshot,
    }),
    position: panel.position ? APP_PANEL_POSITIONS[panel.position] : undefined,
  }
}

// ─── Layout persistence helpers ──────────────────────────────────────────────

/**
 * Build a param lookup from NATIVE_PANEL_DEFS keyed by panel id.
 * Used to re-inject live API bridges after layout restore.
 */
function buildParamLookup(panelDefs: PanelDef[]): Map<string, () => Record<string, unknown>> {
  const lookup = new Map<string, () => Record<string, unknown>>()
  for (const def of panelDefs) {
    if (def.params) {
      lookup.set(def.id, def.params)
    }
  }
  return lookup
}

/**
 * After fromJSON() restores a layout, panels have stale/empty params.
 * Walk every panel and re-inject live params from the registry.
 */
function resolvePanelParams(api: DockviewApi, panelDefs: PanelDef[]): void {
  const lookup = buildParamLookup(panelDefs)
  for (const panel of api.panels) {
    const factory = lookup.get(panel.id)
    if (factory) {
      try {
        panel.api.updateParameters(factory())
      } catch {
        // Panel may not support updateParameters — safe to skip
      }
    }
  }
}

/**
 * Strip non-serializable values (functions, DOM nodes, etc.) from the
 * dockview JSON before persisting over IPC.  This prevents structuredClone
 * errors when electron-store tries to serialize the layout.
 */
function stripNonSerializableFromLayout(layout: SerializedDockview): SerializedDockview | null {
  try {
    // JSON.parse(JSON.stringify(…)) is the simplest and most reliable way
    // to drop functions, undefined, symbols, circular refs, etc.
    return JSON.parse(JSON.stringify(layout))
  } catch (error) {
    console.warn('Layout serialization failed, skipping save', error)
    return null
  }
}

// Loading state: undefined = not yet fetched; null = fetched, no saved layout
type LayoutState = SerializedDockview | null | undefined
type AppPhase = 'loading' | 'wizard' | 'main'

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs)
  })
}

// Outer chrome shell — titlebar + content area + statusbar
function ChromeShell({
  children,
  dockviewApi,
  panelDefs,
  mode,
  onModeToggle,
}: {
  children: React.ReactNode
  dockviewApi: DockviewApi | null
  panelDefs: PanelDef[]
  mode: ShellMode
  onModeToggle: () => void
}) {
  return (
    <div
      data-shell-mode={mode}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--nous-bg)',
      }}
    >
      <TitleBar
        dockviewApi={dockviewApi}
        panelDefs={panelDefs}
        mode={mode}
        onModeToggle={onModeToggle}
      />
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {children}
      </div>
      <StatusBar mode={mode} />
    </div>
  )
}

export function App() {
  const bootstrapRunRef = useRef(0)
  const [phase, setPhase] = useState<AppPhase>('loading')
  const [loadingMessage, setLoadingMessage] = useState('Connecting to backend…')
  const [bootError, setBootError] = useState<string | null>(null)
  const [firstRunState, setFirstRunState] = useState<FirstRunState | null>(null)
  const [savedLayout, setSavedLayout] = useState<LayoutState>(undefined)
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null)
  const [appPanels, setAppPanels] = useState<AppPanelSnapshot[]>([])
  const [mode, setMode] = useState<ShellMode>('simple')
  const [activeRoute, setActiveRoute] = useState(DEFAULT_ROUTE)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [backendPort, setBackendPort] = useState<number | null>(null)
  const [observeWidth, setObserveWidth] = useState(20)

  const initializeApp = useCallback(async () => {
    const runId = ++bootstrapRunRef.current
    const isStale = () => bootstrapRunRef.current !== runId

    setBootError(null)
    setLoadingMessage('Connecting to backend…')
    setPhase('loading')
    setFirstRunState(null)
    setSavedLayout(undefined)
    setDockviewApi(null)
    setAppPanels([])

    const startedAt = Date.now()
    let backendReady = false
    let delayMs = 500

    while (!backendReady && Date.now() - startedAt < 30000) {
      try {
        const status = await window.electronAPI.backend.getStatus()
        if (status.ready) {
          backendReady = true
          break
        }
      } catch {
        // Keep waiting until timeout or successful readiness.
      }

      if (isStale()) {
        return
      }

      const elapsedMs = Date.now() - startedAt
      console.log(`[nous:wizard] Backend readiness wait: ${elapsedMs}ms`)
      setLoadingMessage(`Connecting to backend… (${Math.max(1, Math.ceil(elapsedMs / 1000))}s)`)
      await wait(delayMs)
      delayMs = Math.min(delayMs * 2, 4000)
    }

    if (isStale()) {
      return
    }

    if (!backendReady) {
      setBootError('The desktop backend did not become ready within 30 seconds.')
      return
    }

    // Discover backend port for direct HTTP/SSE transport
    let discoveredPort: number | null = null
    try {
      const port = await window.electronAPI.backend.getPort()
      if (!isStale() && port) {
        discoveredPort = port
        setBackendPort(port)
        setWizardBackendPort(port)
      }
    } catch {
      console.warn('[nous:transport] Failed to get backend port — transport layer unavailable')
    }

    setLoadingMessage('Loading first-run state…')

    try {
      const nextFirstRunState = await trpcQuery<FirstRunState>('firstRun.getWizardState')
      if (isStale()) {
        return
      }

      setFirstRunState(nextFirstRunState)
      if (nextFirstRunState.complete) {
        console.log('[nous:wizard] Phase: loading → main')
        setPhase('main')
      } else {
        console.log('[nous:wizard] Phase: loading → wizard')
        setPhase('wizard')
      }
    } catch (error) {
      if (isStale()) {
        return
      }

      const message = error instanceof Error ? error.message : String(error)
      setBootError(message)
    }
  }, [])

  useEffect(() => {
    void initializeApp()

    return () => {
      bootstrapRunRef.current += 1
    }
  }, [initializeApp])

  useEffect(() => {
    if (phase !== 'main') {
      return
    }

    let cancelled = false
    setLoadingMessage('Loading workspace layout…')

    window.electronAPI.layout.get().then((layout: unknown) => {
      if (cancelled) {
        return
      }

      setSavedLayout((layout as SerializedDockview | null) ?? null)
    }).catch(() => {
      if (cancelled) {
        return
      }

      setSavedLayout(null)
    })

    return () => {
      cancelled = true
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'main') {
      return
    }

    let cancelled = false

    void modePersistence.get().then((storedMode) => {
      if (!cancelled && storedMode) {
        console.log(`[nous:mode] Loaded mode: ${storedMode}`)
        setMode(storedMode)
      }
    })

    return () => {
      cancelled = true
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'main') {
      setAppPanels([])
      return
    }

    let cancelled = false

    if (!backendPort) return

    const syncAppPanels = async () => {
      try {
        const panels = await trpcQuery<AppPanelSnapshot[]>('packages.listAppPanels')
        if (!cancelled && Array.isArray(panels)) {
          const baseUrl = `http://127.0.0.1:${backendPort}`
          setAppPanels(panels.map((p: AppPanelSnapshot) => ({
            ...p,
            src: new URL(p.route_path, baseUrl).toString(),
          })))
        }
      } catch {
        // Backend may not be available yet — retry on next interval
      }
    }

    void syncAppPanels()
    const intervalId = window.setInterval(() => {
      void syncAppPanels()
    }, 10000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [phase, backendPort])

  const handleWizardComplete = useCallback(() => {
    console.log('[nous:wizard] Phase: wizard → main')
    setSavedLayout(undefined)
    setDockviewApi(null)
    setPhase('main')
  }, [])

  const handleWizardReset = useCallback(() => {
    void initializeApp()
  }, [initializeApp])

  const handleNavigate = useCallback((routeId: string) => {
    setActiveRoute(routeId)
  }, [])

  const handleGoBack = useCallback(() => {
    setActiveRoute(DEFAULT_ROUTE)
  }, [])

  const handleModeChange = useCallback((nextMode: ShellMode) => {
    setMode((previousMode) => {
      if (previousMode === nextMode) {
        return previousMode
      }

      console.log(`[nous:mode] Mode switched: ${previousMode} -> ${nextMode}`)
      void modePersistence.set(nextMode)
      return nextMode
    })
  }, [])

  const handleModeToggle = useCallback(() => {
    setMode((previousMode) => {
      const nextMode = previousMode === 'simple' ? 'developer' : 'simple'
      console.log(`[nous:mode] Mode switched: ${previousMode} -> ${nextMode}`)
      void modePersistence.set(nextMode)
      return nextMode
    })
  }, [])

  useEffect(() => {
    if (phase !== 'main') {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.ctrlKey &&
        event.shiftKey &&
        event.key.toLowerCase() === 'd'
      ) {
        event.preventDefault()
        handleModeToggle()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleModeToggle, phase])

  useEffect(() => {
    if (phase !== 'main') return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phase])

  const preferencesPanelParams = useMemo(() => ({
    onWizardReset: handleWizardReset,
    onModeChange: handleModeChange,
    currentMode: mode,
    appPanels: appPanels.map((p) => ({ id: p.dockview_panel_id, title: p.label })),
  }), [handleModeChange, handleWizardReset, mode, appPanels])

  const buildPreferencesPanelParams = useCallback(() => preferencesPanelParams, [preferencesPanelParams])

  const simpleModeRoutes = useMemo(() => ({
    ...BASE_SIMPLE_MODE_ROUTES,
    settings: (_props: ContentRouterRenderProps) => (
      <SettingsRoute preferencesPanelParams={preferencesPanelParams} />
    ),
  }), [preferencesPanelParams])

  const desktopSidebarSections = useMemo(() => buildDesktopSidebarSections(), [])

  const handleDesktopProjectChange = useCallback((newProjectId: string) => {
    setActiveRoute(DEFAULT_ROUTE) // reset content route on project switch
  }, [])

  const commands: CommandGroup[] = useMemo(
    () => buildDesktopCommands({
      navigate: handleNavigate,
      onModeToggle: handleModeToggle,
      onCommandPalette: () => setCommandPaletteOpen(true),
    }),
    [handleNavigate, handleModeToggle],
  )

  const transportConfig = useMemo(
    () => backendPort ? createDesktopTransport(backendPort) : null,
    [backendPort],
  )

  // Health data is now fetched via trpc hooks directly in dashboard widgets.

  const navigation = {
    activeRoute,
    history: [activeRoute],
    canGoBack: activeRoute !== DEFAULT_ROUTE,
  }

  const nativePanelDefs = NATIVE_PANEL_DEFS.map((def) => {
    if (def.id !== 'preferences') {
      return def
    }

    return {
      ...def,
      params: buildPreferencesPanelParams,
    }
  })

  const panelDefs = [...nativePanelDefs, ...appPanels.map(toAppPanelDef)]

  const loadingShell = (
    <ChromeShell
      dockviewApi={null}
      panelDefs={panelDefs}
      mode={mode}
      onModeToggle={handleModeToggle}
    >
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--nous-bg)',
          color: 'var(--nous-fg-subtle)',
          fontSize: 'var(--nous-font-size-base)',
          padding: 'var(--nous-space-3xl)',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'grid', gap: 'var(--nous-space-lg)' }}>
          {bootError ? (
            <>
              <div>{bootError}</div>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    void initializeApp()
                  }}
                  style={{
                    minHeight: '40px',
                    padding: '0 var(--nous-space-3xl)',
                    border: '1px solid var(--nous-btn-secondary-border)',
                    borderRadius: 'var(--nous-input-radius)',
                    background: 'var(--nous-btn-secondary-bg)',
                    color: 'var(--nous-btn-secondary-fg)',
                    cursor: 'pointer',
                  }}
                >
                  Retry
                </button>
              </div>
            </>
          ) : (
            <div>{loadingMessage}</div>
          )}
        </div>
      </div>
    </ChromeShell>
  )

  if (phase === 'loading' || bootError) {
    return loadingShell
  }

  if (phase === 'wizard' && firstRunState) {
    return (
      <ChromeShell
        dockviewApi={null}
        panelDefs={panelDefs}
        mode={mode}
        onModeToggle={handleModeToggle}
      >
        <FirstRunWizard
          initialState={firstRunState}
          onComplete={handleWizardComplete}
        />
      </ChromeShell>
    )
  }

  if (savedLayout === undefined) {
    return loadingShell
  }

  const shellChildren = (
    <>
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commands}
      />
      {mode === 'simple' ? (
        <SimpleShellLayout
          projectRail={<DesktopProjectRail />}
          sidebar={<DesktopAssetSidebarConnected sections={desktopSidebarSections} />}
          content={
            <ContentRouter
              activeRoute={activeRoute}
              routes={simpleModeRoutes}
              onNavigate={handleNavigate}
            />
          }
          observe={
            <CollapsibleObserveEdge
              width={observeWidth}
              onExpandToggle={() => setObserveWidth((w) => w < 60 ? 300 : 20)}
            >
              <ObservePanel />
            </CollapsibleObserveEdge>
          }
          onColumnResize={(widths) => setObserveWidth(widths.observe)}
        />
      ) : (
        <DockviewShell
          savedLayout={savedLayout}
          onApiReady={setDockviewApi}
          activeAppPanelIds={new Set(appPanels.map((panel) => panel.dockview_panel_id))}
          panelDefs={panelDefs}
        />
      )}
    </>
  )

  const mainContent = (
    <DesktopShellWithProject
      mode={mode}
      activeRoute={activeRoute}
      navigation={navigation}
      navigate={handleNavigate}
      goBack={handleGoBack}
      onProjectChange={handleDesktopProjectChange}
    >
      {shellChildren}
    </DesktopShellWithProject>
  )

  return (
    <ChromeShell
      dockviewApi={dockviewApi}
      panelDefs={panelDefs}
      mode={mode}
      onModeToggle={handleModeToggle}
    >
      {transportConfig ? (
        <TransportProvider config={transportConfig}>
          {mainContent}
        </TransportProvider>
      ) : (
        mainContent
      )}
    </ChromeShell>
  )
}

// ─── Project boot wrapper ───────────────────────────────────────────────────
// Renders inside TransportProvider so tRPC hooks are available.
// Boots a default project on mount, then passes activeProjectId to ShellProvider.

function DesktopShellWithProject({
  children,
  mode,
  activeRoute,
  navigation,
  navigate,
  goBack,
  onProjectChange,
}: {
  children: React.ReactNode
  mode: ShellMode
  activeRoute: string
  navigation: { activeRoute: string; history: string[]; canGoBack: boolean }
  navigate: (routeId: string) => void
  goBack: () => void
  onProjectChange?: (projectId: string) => void
}) {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)

  const { data: projectList } = trpc.projects.list.useQuery()
  const createProject = trpc.projects.create.useMutation()

  useEffect(() => {
    if (!projectList) return // still loading
    if (projectList.length > 0) {
      setActiveProjectId(projectList[0].id)
    } else {
      createProject.mutateAsync({ name: 'Default' }).then((created) => {
        setActiveProjectId(created.id)
      })
    }
  }, [projectList]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleProjectChange = useCallback((projectId: string) => {
    setActiveProjectId(projectId)
    onProjectChange?.(projectId)
  }, [onProjectChange])

  return (
    <ShellProvider
      mode={mode}
      activeRoute={activeRoute}
      navigation={navigation}
      navigate={navigate}
      goBack={goBack}
      activeProjectId={activeProjectId}
      onProjectChange={handleProjectChange}
    >
      {children}
    </ShellProvider>
  )
}

// ─── Desktop Project Rail (wired to tRPC) ──────────────────────────────────

function DesktopAssetSidebarConnected({ sections }: { sections: import('@nous/ui/components').AssetSection[] }) {
  const { activeProjectId, activeRoute, navigate } = useShellCtx()
  const { data: projectList } = trpc.projects.list.useQuery()

  const projectName = useMemo(() => {
    if (!projectList || !activeProjectId) return 'Project'
    const proj = projectList.find((p: { id: string }) => p.id === activeProjectId)
    return proj?.name ?? 'Project'
  }, [projectList, activeProjectId])

  return (
    <AssetSidebar
      projectName={projectName}
      topNav={DESKTOP_TOP_NAV}
      sections={sections}
      activeRoute={activeRoute}
      onNavigate={navigate}
      chatSlot={(_props: { stage: ChatStage; onStageChange: (s: ChatStage) => void }) => (
        <ConnectedChatSurface />
      )}
    />
  )
}

function DesktopProjectRail() {
  const { activeProjectId, onProjectChange } = useShellCtx()
  const { data: projectList } = trpc.projects.list.useQuery()

  const projects = useMemo(
    () => (projectList ?? []).map((p: { id: string; name?: string }) => ({ id: p.id, name: p.name ?? p.id })),
    [projectList],
  )

  return (
    <ProjectSwitcherRail
      projects={projects}
      activeProjectId={activeProjectId ?? ''}
      onProjectSelect={(id) => onProjectChange?.(id)}
    />
  )
}

// ─── Per-group header actions (right side of tab bar) ───────────────────────
// Conditionally renders per-panel header controls when the matching tab is
// active in a given group. Other panels get no extra actions.

function OuterHeaderActions({ activePanel }: IDockviewHeaderActionsProps) {
  const dashboardApi = useDashboardApi()
  const isCodexBarPanel = activePanel?.api.component === 'codexbar'
  const codexBarApi = useCodexBarApi(isCodexBarPanel ? activePanel?.id : undefined)

  if (activePanel?.id === 'dashboard' && dashboardApi) {
    return <DashboardWidgetMenu api={dashboardApi} />
  }

  if (isCodexBarPanel && codexBarApi) {
    return <CodexBarHeaderActions api={codexBarApi} />
  }

  return null
}

function DockviewShell({
  savedLayout,
  onApiReady,
  activeAppPanelIds,
  panelDefs,
}: {
  savedLayout: SerializedDockview | null
  onApiReady: (api: DockviewApi) => void
  activeAppPanelIds: Set<string>
  panelDefs: PanelDef[]
}) {
  const dockviewApiRef = useRef<DockviewApi | null>(null)

  useEffect(() => {
    if (!dockviewApiRef.current) return

    for (const panel of dockviewApiRef.current.panels) {
      if (panel.id.startsWith('app:') && !activeAppPanelIds.has(panel.id)) {
        dockviewApiRef.current.removePanel(panel)
      }
    }
  }, [activeAppPanelIds])

  const onReady = useCallback((event: DockviewReadyEvent) => {
    let layoutRestored = false

    if (savedLayout) {
      try {
        event.api.fromJSON(savedLayout)
        layoutRestored = true
      } catch {
        // Saved layout is incompatible — fall through to default
      }
    }

    if (!layoutRestored) {
      initDefaultLayout(event, panelDefs)
    }

    // After any layout init (restored or default), re-inject live API bridges
    // so panels have working APIs immediately on first render.
    resolvePanelParams(event.api, panelDefs)

    // Persist layout on every change (UI-INV-006).
    // ALWAYS strip non-serializable params before sending over IPC to
    // prevent structuredClone errors on functions/DOM nodes.
    event.api.onDidLayoutChange(() => {
      const json = event.api.toJSON()
      const safe = stripNonSerializableFromLayout(json)
      if (!safe) {
        return
      }

      try {
        void window.electronAPI.layout.set(safe).catch((error) => {
          console.error('Layout save failed', error)
        })
      } catch (error) {
        console.error('Layout save failed', error)
      }
    })

    dockviewApiRef.current = event.api
    onApiReady(event.api)
  }, [savedLayout, onApiReady, panelDefs])

  return (
    <div style={{ height: '100%', width: '100%', padding: 'var(--nous-space-sm)', boxSizing: 'border-box', background: 'var(--nous-surface)' }}>
      <DockviewReact
        className="dockview-theme-dark"
        onReady={onReady}
        components={panelComponents}
        rightHeaderActionsComponent={OuterHeaderActions}
      />
    </div>
  )
}

// Position directives for the default 4-panel layout
const DEFAULT_POSITIONS: Record<string, { direction: string; referencePanel: string }> = {
  'app-installer': { direction: 'within', referencePanel: 'chat' },
  files: { direction: 'below', referencePanel: 'chat' },
  'node-projection': { direction: 'right', referencePanel: 'chat' },
  mao: { direction: 'below', referencePanel: 'node-projection' },
  codexbar: { direction: 'within', referencePanel: 'chat' },
  dashboard: { direction: 'within', referencePanel: 'chat' },
  'coding-agents': { direction: 'within', referencePanel: 'mao' },
  preferences: { direction: 'within', referencePanel: 'chat' },
  'workflow-builder': { direction: 'within', referencePanel: 'chat' },
}

/**
 * Adds panels in dependency-safe order. Panels that reference others
 * (via position.referencePanel) are added AFTER their reference target.
 */
function initDefaultLayout(event: DockviewReadyEvent, panelDefs: PanelDef[]) {
  const defById = new Map(panelDefs.map((d) => [d.id, d]))

  for (const id of PANEL_ADD_ORDER) {
    const def = defById.get(id)
    if (!def) continue

    const position = DEFAULT_POSITIONS[def.id]

    // Verify reference panel exists before using position directive
    if (position) {
      const refExists = event.api.panels.some((p) => p.id === position.referencePanel)
      if (!refExists) {
        // Reference panel not added yet — add without position (will go to default area)
        event.api.addPanel({
          id: def.id,
          component: def.component,
          title: def.title,
          params: def.params?.() ?? {},
        })
        continue
      }
    }

    event.api.addPanel({
      id: def.id,
      component: def.component,
      title: def.title,
      params: def.params?.() ?? {},
      ...(position ? { position } : {}),
    })
  }
}
