import { useState, useEffect } from 'react'
import { DockviewReact } from 'dockview-react'
import type {
  DockviewApi,
  DockviewReadyEvent,
  SerializedDockview,
  IDockviewHeaderActionsProps,
} from 'dockview-react'
import {
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
import { TitleBar } from './components/TitleBar'
import { StatusBar } from './components/StatusBar'

import 'dockview-react/dist/styles/dockview.css'

const panelComponents = {
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
}

export const PANEL_DEFS: PanelDef[] = [
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

// Loading state: undefined = not yet fetched; null = fetched, no saved layout
type LayoutState = SerializedDockview | null | undefined

// Outer chrome shell — titlebar + content area + statusbar
function ChromeShell({
  children,
  dockviewApi,
}: {
  children: React.ReactNode
  dockviewApi: DockviewApi | null
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
      <TitleBar dockviewApi={dockviewApi} />
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

  useEffect(() => {
    window.electronAPI.layout.get().then((layout) => {
      setSavedLayout((layout as SerializedDockview | null) ?? null)
    })
  }, [])

  if (savedLayout === undefined) {
    return (
      <ChromeShell dockviewApi={null}>
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
    <ChromeShell dockviewApi={dockviewApi}>
      <DockviewShell savedLayout={savedLayout} onApiReady={setDockviewApi} />
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
}: {
  savedLayout: SerializedDockview | null
  onApiReady: (api: DockviewApi) => void
}) {
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
  files: { direction: 'below', referencePanel: 'chat' },
  'node-projection': { direction: 'right', referencePanel: 'chat' },
  mao: { direction: 'below', referencePanel: 'node-projection' },
  codexbar: { direction: 'within', referencePanel: 'chat' },
  dashboard: { direction: 'within', referencePanel: 'chat' },
}

function initDefaultLayout(event: DockviewReadyEvent) {
  for (const def of PANEL_DEFS) {
    event.api.addPanel({
      id: def.id,
      component: def.component,
      title: def.title,
      params: def.params?.() ?? {},
      ...(DEFAULT_POSITIONS[def.id] ? { position: DEFAULT_POSITIONS[def.id] } : {}),
    })
  }
}
