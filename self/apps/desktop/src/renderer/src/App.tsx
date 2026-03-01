import { useState, useEffect } from 'react'
import { DockviewReact } from 'dockview-react'
import type { DockviewReadyEvent, SerializedDockview } from 'dockview-react'
import { PlaceholderPanel, FileBrowserPanel } from '@nous/ui/panels'

import 'dockview-react/dist/styles/dockview.css'

const panelComponents = {
  placeholder: PlaceholderPanel,
  'file-browser': FileBrowserPanel,
}

// Loading state: undefined = not yet fetched; null = fetched, no saved layout
type LayoutState = SerializedDockview | null | undefined

export function App() {
  const [savedLayout, setSavedLayout] = useState<LayoutState>(undefined)

  useEffect(() => {
    window.electronAPI.layout.get().then((layout) => {
      setSavedLayout((layout as SerializedDockview | null) ?? null)
    })
  }, [])

  if (savedLayout === undefined) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#18181b',
          color: '#71717a',
          fontSize: '14px',
        }}
      >
        Loading...
      </div>
    )
  }

  return <DockviewShell savedLayout={savedLayout} />
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
  event.api.addPanel({
    id: 'welcome',
    component: 'placeholder',
    title: 'Welcome to Nous',
  })
  event.api.addPanel({
    id: 'files',
    component: 'file-browser',
    title: 'Files',
    position: { direction: 'right', referencePanel: 'welcome' },
    params: {
      fsApi: (window as any).electronAPI?.fs,
      initialPath: '/',
    },
  })
}
