import { useState, useEffect, useRef, useCallback } from 'react'
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
  AgentPanel,
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
  codexbar: CodexBarPanel,
  dashboard: DashboardPanel,
  'coding-agents': AgentPanel,
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

// ─── Panel registry ──────────────────────────────────────────────────────────
// Panels that resolve live API bridges from window.electronAPI at render time.
// The params factory is invoked both when adding a panel and after layout restore.

export const NATIVE_PANEL_DEFS: PanelDef[] = [
  {
    id: 'chat',
    component: 'chat',
    title: 'Principal \u2194 Cortex',
    params: () => ({ chatApi: window.electronAPI?.chat }),
  },
  {
    id: 'app-installer',
    component: 'app-installer',
    title: 'App Installer',
    params: () => ({
      appInstallApi: window.electronAPI?.appInstall,
      appSettingsApi: window.electronAPI?.appSettings,
    }),
  },
  {
    id: 'files',
    component: 'file-browser',
    title: 'Files',
    params: () => ({ fsApi: window.electronAPI?.fs, initialPath: '/' }),
  },
  { id: 'node-projection', component: 'node-projection', title: 'Skill Projection' },
  { id: 'mao', component: 'mao', title: 'MAO', params: () => ({ maoApi: (window as any).electronAPI?.mao }) },
  {
    id: 'codexbar',
    component: 'codexbar',
    title: 'AI Usage',
    params: () => ({ usageApi: window.electronAPI?.usage }),
  },
  { id: 'dashboard', component: 'dashboard', title: 'Dashboard' },
  { id: 'coding-agents', component: 'coding-agents', title: 'Coding Agents' },
  { id: 'preferences', component: 'preferences', title: 'Preferences', params: () => ({ preferencesApi: (window as any).electronAPI?.preferences }) },
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

// ─── Layout persistence helpers ──────────────────────────────────────────────

/**
 * Build a param lookup from NATIVE_PANEL_DEFS keyed by panel id.
 * Used to re-inject live API bridges after layout restore.
 */
function buildParamLookup(): Map<string, () => Record<string, unknown>> {
  const lookup = new Map<string, () => Record<string, unknown>>()
  for (const def of NATIVE_PANEL_DEFS) {
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
function resolvePanelParams(api: DockviewApi): void {
  const lookup = buildParamLookup()
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
function stripNonSerializableFromLayout(layout: SerializedDockview): SerializedDockview {
  try {
    // JSON.parse(JSON.stringify(…)) is the simplest and most reliable way
    // to drop functions, undefined, symbols, circular refs, etc.
    return JSON.parse(JSON.stringify(layout))
  } catch {
    // If serialization itself throws, return layout unchanged and let the
    // IPC layer handle the error gracefully.
    return layout
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
    }).catch(() => {
      setSavedLayout(null)
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    const syncAppPanels = async () => {
      try {
        const panels = await window.electronAPI.appPanels.list()
        if (!cancelled) {
          setAppPanels(panels)
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
      initDefaultLayout(event)
    }

    // After any layout init (restored or default), re-inject live API bridges
    // so panels have working APIs immediately on first render.
    resolvePanelParams(event.api)

    // Persist layout on every change (UI-INV-006).
    // ALWAYS strip non-serializable params before sending over IPC to
    // prevent structuredClone errors on functions/DOM nodes.
    event.api.onDidLayoutChange(() => {
      const json = event.api.toJSON()
      const safe = stripNonSerializableFromLayout(json)
      window.electronAPI.layout.set(safe).catch(() => {
        // Layout save failed — non-critical, will retry on next change
      })
    })

    dockviewApiRef.current = event.api
    onApiReady(event.api)
  }, [savedLayout, onApiReady])

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

/**
 * Adds panels in dependency-safe order. Panels that reference others
 * (via position.referencePanel) are added AFTER their reference target.
 */
function initDefaultLayout(event: DockviewReadyEvent) {
  const defById = new Map(NATIVE_PANEL_DEFS.map((d) => [d.id, d]))

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
