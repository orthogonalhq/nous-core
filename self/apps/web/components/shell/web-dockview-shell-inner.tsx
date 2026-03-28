'use client'

import * as React from 'react'
import { useCallback, useRef } from 'react'
import { DockviewReact } from 'dockview-react'
import type { DockviewApi, DockviewReadyEvent, SerializedDockview } from 'dockview-react'
import { webPanelComponents } from './web-panel-map'

import 'dockview-react/dist/styles/dockview.css'

const LAYOUT_STORAGE_KEY = 'nous-web-dockview-layout'

function initDefaultWebLayout(api: DockviewApi): void {
  // Matches desktop DEFAULT_POSITIONS (excluding Electron-only: files, app-installer)
  api.addPanel({ id: 'chat', component: 'chat', title: 'Chat' })
  api.addPanel({ id: 'node-projection', component: 'node-projection', title: 'Node Projection', position: { referencePanel: 'chat', direction: 'right' } })
  api.addPanel({ id: 'mao', component: 'mao', title: 'MAO', position: { referencePanel: 'node-projection', direction: 'below' } })
  api.addPanel({ id: 'codexbar', component: 'codexbar', title: 'CodexBar', position: { referencePanel: 'chat', direction: 'within' } })
  api.addPanel({ id: 'dashboard', component: 'dashboard', title: 'Dashboard', position: { referencePanel: 'chat', direction: 'within' } })
  api.addPanel({ id: 'coding-agents', component: 'coding-agents', title: 'Coding Agents', position: { referencePanel: 'mao', direction: 'within' } })
  api.addPanel({ id: 'preferences', component: 'preferences', title: 'Preferences', position: { referencePanel: 'chat', direction: 'within' } })
  api.addPanel({ id: 'workflow-builder', component: 'workflow-builder', title: 'Workflow Builder', position: { referencePanel: 'chat', direction: 'within' } })

  console.log('[nous:dockview] Default web layout initialized')
}

export interface WebDockviewShellInnerProps {
  onApiReady?: (api: DockviewApi) => void
}

export function WebDockviewShellInner({ onApiReady }: WebDockviewShellInnerProps) {
  const apiRef = useRef<DockviewApi | null>(null)

  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      const api = event.api
      apiRef.current = api

      // Attempt to restore saved layout
      try {
        const saved = localStorage.getItem(LAYOUT_STORAGE_KEY)
        if (saved) {
          const layout: SerializedDockview = JSON.parse(saved)
          api.fromJSON(layout)
          console.log('[nous:dockview] Layout restored from localStorage')
        } else {
          initDefaultWebLayout(api)
        }
      } catch (error) {
        console.warn('[nous:dockview] Layout restore failed, using default', error)
        initDefaultWebLayout(api)
      }

      // Persist layout on changes
      const disposable = api.onDidLayoutChange(() => {
        try {
          const layout = api.toJSON()
          const serialized = JSON.parse(JSON.stringify(layout))
          localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(serialized))
          console.log('[nous:dockview] Layout saved')
        } catch (error) {
          console.warn('[nous:dockview] Layout save failed', error)
        }
      })

      onApiReady?.(api)

      return () => {
        disposable.dispose()
      }
    },
    [onApiReady],
  )

  return (
    <div style={{ height: '100%', width: '100%', padding: 'var(--nous-space-sm)', boxSizing: 'border-box', background: 'var(--nous-surface)' }}>
      <DockviewReact
        components={webPanelComponents}
        onReady={handleReady}
        className="dockview-theme-dark"
      />
    </div>
  )
}
