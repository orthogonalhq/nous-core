import { useState, useEffect } from 'react'
import { DockviewReact } from 'dockview-react'
import type { DockviewReadyEvent, SerializedDockview } from 'dockview-react'
import {
  PlaceholderPanel,
  ChatPanel,
  FileBrowserPanel,
  NodeProjectionPanel,
  MAOPanel,
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
}

// Loading state: undefined = not yet fetched; null = fetched, no saved layout
type LayoutState = SerializedDockview | null | undefined

// Outer chrome shell — titlebar + content area + statusbar
function ChromeShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: '#18181b',
      }}
    >
      <TitleBar />
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {children}
      </div>
      <StatusBar />
    </div>
  )
}

export function App() {
  const [savedLayout, setSavedLayout] = useState<LayoutState>(undefined)

  useEffect(() => {
    window.electronAPI.layout.get().then((layout) => {
      setSavedLayout((layout as SerializedDockview | null) ?? null)
    })
  }, [])

  if (savedLayout === undefined) {
    return (
      <ChromeShell>
        <div
          style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#18181b',
            color: '#71717a',
            fontSize: '13px',
          }}
        >
          Loading...
        </div>
      </ChromeShell>
    )
  }

  return (
    <ChromeShell>
      <DockviewShell savedLayout={savedLayout} />
    </ChromeShell>
  )
}

function DockviewShell({ savedLayout }: { savedLayout: SerializedDockview | null }) {
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
  }

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <DockviewReact
        className="dockview-theme-dark"
        onReady={onReady}
        components={panelComponents}
      />
    </div>
  )
}

function initDefaultLayout(event: DockviewReadyEvent) {
  // Left column: chat (primary interaction)
  event.api.addPanel({
    id: 'chat',
    component: 'chat',
    title: 'Principal \u2194 Cortex',
    params: {
      chatApi: (window as any).electronAPI?.chat,
    },
  })

  // Left column bottom: file browser
  event.api.addPanel({
    id: 'files',
    component: 'file-browser',
    title: 'Files',
    position: { direction: 'below', referencePanel: 'chat' },
    params: {
      fsApi: (window as any).electronAPI?.fs,
      initialPath: '/',
    },
  })

  // Right column top: node projection
  event.api.addPanel({
    id: 'node-projection',
    component: 'node-projection',
    title: 'Skill Projection',
    position: { direction: 'right', referencePanel: 'chat' },
  })

  // Right column bottom: MAO
  event.api.addPanel({
    id: 'mao',
    component: 'mao',
    title: 'MAO',
    position: { direction: 'below', referencePanel: 'node-projection' },
  })
}
