import { useState, useEffect, useRef } from 'react'
import { DockviewReact } from 'dockview-react'
import type {
  DockviewApi,
  DockviewReadyEvent,
  SerializedDockview,
  IDockviewHeaderActionsProps,
} from 'dockview-react'
import {
  AppIframePanel,
  PlaceholderPanel,
  ChatPanel,
  FileBrowserPanel,
  NodeProjectionPanel,
  MAOPanel,
  AgentPanel,
  CodexBarPanel,
  CodexBarHeaderActions,
  useCodexBarApi,
  DashboardPanel,
  DashboardWidgetMenu,
  useDashboardApi,
  PreferencesPanel,
} from '@nous/ui/panels'
import { AppInstallWizardPanel } from './components/AppInstallWizard'
import { TitleBar } from './components/TitleBar'
import { StatusBar } from './components/StatusBar'

import 'dockview-react/dist/styles/dockview.css'

const panelComponents = {
  'app-installer': AppInstallWizardPanel,
  'app-iframe': AppIframePanel,
  placeholder: PlaceholderPanel,
  chat: ChatPanel,
  'file-browser': FileBrowserPanel,
  'node-projection': NodeProjectionPanel,
  mao: MAOPanel,
  'coding-agents': AgentPanel,
  codexbar: CodexBarPanel,
  dashboard: DashboardPanel,
  preferences: PreferencesPanel,
}

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

export const NATIVE_PANEL_DEFS: PanelDef[] = [
  {
    id: 'app-installer',
    component: 'app-installer',
    title: 'App Installer',
    params: () => ({
      appInstallApi: (window as any).electronAPI?.appInstall,
      appSettingsApi: (window as any).electronAPI?.appSettings,
    }),
  },
  {
    id: 'chat',
    component: 'chat',
    title: 'Principal \u2194 Cortex',
    params: () => ({ chatApi: (window as any).electronAPI?.chat }),
  },
  {
    id: 'files',
    component: 'file-browser',
    title: 'Files',
    params: () => ({ fsApi: (window as any).electronAPI?.fs, initialPath: '/' }),
  },
  { id: 'node-projection', component: 'node-projection', title: 'Skill Projection' },
  { id: 'mao', component: 'mao', title: 'MAO', params: () => ({ maoApi: (window as any).electronAPI?.mao }) },
  {
    id: 'codexbar',
    component: 'codexbar',
    title: 'AI Usage',
    params: () => ({ usageApi: (window as any).electronAPI?.usage }),
  },
  { id: 'dashboard', component: 'dashboard', title: 'Dashboard' },
  { id: 'coding-agents', component: 'coding-agents', title: 'Coding Agents' },
  { id: 'preferences', component: 'preferences', title: 'Preferences' },
]

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

// Loading state: undefined = not yet fetched; null = fetched, no saved layout
type LayoutState = SerializedDockview | null | undefined

// Outer chrome shell — titlebar + content area + statusbar
function ChromeShell({
  children,
  dockviewApi,
  panelDefs,
}: {
  children: React.ReactNode
  dockviewApi: DockviewApi | null
  panelDefs: PanelDef[]
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--nous-bg)',
      }}
    >
      <TitleBar dockviewApi={dockviewApi} panelDefs={panelDefs} />
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {children}
      </div>
      <StatusBar />
    </div>
  )
}

// Create a preferences API bridge from a tRPC base URL
function createPreferencesApiBridge(baseUrl: string) {
  const trpcQuery = async (path: string, input?: unknown) => {
    const url = new URL(`${baseUrl}/${path}`)
    if (input !== undefined) {
      url.searchParams.set('input', JSON.stringify({ json: input }))
    }
    const res = await fetch(url.toString())
    const data = await res.json()
    return data?.result?.data?.json ?? data?.result?.data ?? data
  }
  const trpcMutation = async (path: string, input: unknown) => {
    const res = await fetch(`${baseUrl}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ json: input }),
    })
    const data = await res.json()
    return data?.result?.data?.json ?? data?.result?.data ?? data
  }
  return {
    getApiKeys: () => trpcQuery('preferences.getApiKeys'),
    setApiKey: (input: { provider: string; key: string }) => trpcMutation('preferences.setApiKey', input),
    deleteApiKey: (input: { provider: string }) => trpcMutation('preferences.deleteApiKey', input),
    testApiKey: (input: { provider: string; key: string }) => trpcMutation('preferences.testApiKey', input),
    getSystemStatus: () => trpcQuery('preferences.getSystemStatus'),
    getAvailableModels: () => trpcQuery('preferences.getAvailableModels'),
    getModelSelection: () => trpcQuery('preferences.getModelSelection'),
    setModelSelection: (input: { principal?: string; system?: string }) => trpcMutation('preferences.setModelSelection', input),
  }
}

export function App() {
  const [savedLayout, setSavedLayout] = useState<LayoutState>(undefined)
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null)
  const [appPanels, setAppPanels] = useState<AppPanelSnapshot[]>([])
  const [backendTrpcUrl, setBackendTrpcUrl] = useState<string | null>(null)
  const panelDefs = [...NATIVE_PANEL_DEFS, ...appPanels.map(toAppPanelDef)]

  // Discover backend URL on startup
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const status = await window.electronAPI.backend.getStatus()
        if (status.ready && status.trpcUrl && !cancelled) {
          setBackendTrpcUrl(status.trpcUrl)
        }
      } catch { /* not ready */ }
    }
    void poll()
    const id = setInterval(poll, 1000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // Wire dynamic APIs into panels when backend is available
  // Runs on backend discovery AND on dockview ready (whichever comes last)
  useEffect(() => {
    if (!backendTrpcUrl || !dockviewApi) return

    const preferencesApi = createPreferencesApiBridge(backendTrpcUrl)

    // Wire all panels that need the backend
    for (const panel of dockviewApi.panels) {
      if (panel.id === 'preferences') {
        panel.api.updateParameters({ preferencesApi })
      }
    }

    // Also wire any panels added later (e.g., opened from menu after startup)
    const disposable = dockviewApi.onDidAddPanel((event) => {
      if (event.id === 'preferences') {
        event.api.updateParameters({ preferencesApi })
      }
    })

    return () => disposable.dispose()
  }, [backendTrpcUrl, dockviewApi])

  useEffect(() => {
    window.electronAPI.layout.get().then((layout: unknown) => {
      setSavedLayout((layout as SerializedDockview | null) ?? null)
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    const syncAppPanels = async () => {
      const panels = await window.electronAPI.appPanels.list()
      if (!cancelled) {
        setAppPanels(panels)
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
  }, [])

  if (savedLayout === undefined) {
    return (
      <ChromeShell dockviewApi={null} panelDefs={panelDefs}>
        <div
          style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--nous-bg)',
            color: 'var(--nous-fg-subtle)',
            fontSize: 'var(--nous-font-size-base)',
          }}
        >
          Loading...
        </div>
      </ChromeShell>
    )
  }

  return (
    <ChromeShell dockviewApi={dockviewApi} panelDefs={panelDefs}>
      <DockviewShell
        savedLayout={savedLayout}
        onApiReady={setDockviewApi}
        activeAppPanelIds={new Set(appPanels.map((panel) => panel.dockview_panel_id))}
      />
    </ChromeShell>
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

/** Strip non-serializable values from panel params before IPC transport. */
function stripNonSerializableParams(layout: SerializedDockview): SerializedDockview {
  try {
    // JSON.parse(JSON.stringify(...)) drops functions, undefined, Symbols, etc.
    return JSON.parse(JSON.stringify(layout)) as SerializedDockview
  } catch {
    // If the layout is completely unserializable, return a minimal safe copy
    // with panel params emptied out.
    const safe = { ...layout } as any
    if (safe.panels) {
      for (const key of Object.keys(safe.panels)) {
        try {
          JSON.stringify(safe.panels[key])
        } catch {
          safe.panels[key] = { ...safe.panels[key], params: {} }
        }
      }
    }
    return safe as SerializedDockview
  }
}

/** Resolve live params for a panel by its definition. */
function resolvePanelParams(panelId: string): Record<string, unknown> {
  const def = NATIVE_PANEL_DEFS.find((d) => d.id === panelId)
  if (def?.params) return def.params()
  return {}
}

function DockviewShell({
  savedLayout,
  onApiReady,
  activeAppPanelIds,
}: {
  savedLayout: SerializedDockview | null
  onApiReady: (api: DockviewApi) => void
  activeAppPanelIds: Set<string>
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

  const onReady = (event: DockviewReadyEvent) => {
    if (savedLayout) {
      try {
        event.api.fromJSON(savedLayout)
        // Re-inject live API params into restored panels (functions are stripped
        // during serialization, so params like chatApi, fsApi, etc. are missing
        // after a layout restore).
        for (const panel of event.api.panels) {
          const liveParams = resolvePanelParams(panel.id)
          if (Object.keys(liveParams).length > 0) {
            panel.api.updateParameters(liveParams)
          }
        }
      } catch {
        initDefaultLayout(event)
      }
    } else {
      initDefaultLayout(event)
    }

    // Persist layout on every change (UI-INV-006)
    // Strip functions/non-serializable values before sending through IPC.
    event.api.onDidLayoutChange(() => {
      const raw = event.api.toJSON()
      const safe = stripNonSerializableParams(raw)
      window.electronAPI.layout.set(safe)
    })

    dockviewApiRef.current = event.api
    onApiReady(event.api)
  }

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
}

// Panels ordered so that every referencePanel is already added before it's referenced.
// 'chat' must come first since most panels reference it; 'node-projection' must precede
// 'mao' which references it.
const PANEL_ADD_ORDER: string[] = [
  'chat',
  'app-installer',
  'files',
  'node-projection',
  'mao',
  'codexbar',
  'dashboard',
  'coding-agents',
  'preferences',
]

function initDefaultLayout(event: DockviewReadyEvent) {
  const defById = new Map(NATIVE_PANEL_DEFS.map((d) => [d.id, d]))
  const addedPanelIds = new Set<string>()

  for (const panelId of PANEL_ADD_ORDER) {
    const def = defById.get(panelId)
    if (!def) continue

    // Resolve position — verify the referenced panel actually exists before using it
    let position = DEFAULT_POSITIONS[def.id]
    if (position && !addedPanelIds.has(position.referencePanel)) {
      // Referenced panel hasn't been added yet — fall back to no explicit position
      // (dockview will add it as a new group)
      position = undefined as any
    }

    event.api.addPanel({
      id: def.id,
      component: def.component,
      title: def.title,
      params: def.params?.() ?? {},
      ...(position ? { position } : {}),
    })

    addedPanelIds.add(def.id)
  }

  // Add any NATIVE_PANEL_DEFS that weren't in PANEL_ADD_ORDER (future-proofing)
  for (const def of NATIVE_PANEL_DEFS) {
    if (addedPanelIds.has(def.id)) continue

    let position = DEFAULT_POSITIONS[def.id]
    if (position && !addedPanelIds.has(position.referencePanel)) {
      position = undefined as any
    }

    event.api.addPanel({
      id: def.id,
      component: def.component,
      title: def.title,
      params: def.params?.() ?? {},
      ...(position ? { position } : {}),
    })

    addedPanelIds.add(def.id)
  }
}
