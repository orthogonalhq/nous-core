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
  CodexBarPanel,
  CodexBarHeaderActions,
  useCodexBarApi,
  DashboardPanel,
  DashboardWidgetMenu,
  useDashboardApi,
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
  codexbar: CodexBarPanel,
  dashboard: DashboardPanel,
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
  { id: 'mao', component: 'mao', title: 'MAO' },
  {
    id: 'codexbar',
    component: 'codexbar',
    title: 'AI Usage',
    params: () => ({ usageApi: (window as any).electronAPI?.usage }),
  },
  { id: 'dashboard', component: 'dashboard', title: 'Dashboard' },
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

export function App() {
  const [savedLayout, setSavedLayout] = useState<LayoutState>(undefined)
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null)
  const [appPanels, setAppPanels] = useState<AppPanelSnapshot[]>([])
  const panelDefs = [...NATIVE_PANEL_DEFS, ...appPanels.map(toAppPanelDef)]

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
      } catch {
        initDefaultLayout(event)
      }
    } else {
      initDefaultLayout(event)
    }

    // Persist layout on every change (UI-INV-006)
    event.api.onDidLayoutChange(() => {
      window.electronAPI.layout.set(event.api.toJSON())
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
}

function initDefaultLayout(event: DockviewReadyEvent) {
  for (const def of NATIVE_PANEL_DEFS) {
    event.api.addPanel({
      id: def.id,
      component: def.component,
      title: def.title,
      params: def.params?.() ?? {},
      ...(DEFAULT_POSITIONS[def.id] ? { position: DEFAULT_POSITIONS[def.id] } : {}),
    })
  }
}
