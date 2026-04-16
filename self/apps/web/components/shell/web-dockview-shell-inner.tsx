'use client'

import * as React from 'react'
import { useCallback, useRef } from 'react'
import { DockviewReact } from 'dockview-react'
import type { DockviewApi, DockviewReadyEvent, SerializedDockview } from 'dockview-react'
import { webPanelComponents } from './web-panel-map'
import { WEB_PANEL_DEFS, DEFAULT_POSITIONS, PANEL_ADD_ORDER } from './web-panel-defs'

const LAYOUT_STORAGE_KEY = 'nous-web-dockview-layout'

function initDefaultWebLayout(api: DockviewApi): void {
  const defMap = new Map(WEB_PANEL_DEFS.map((d) => [d.id, d]))

  for (const id of PANEL_ADD_ORDER) {
    const def = defMap.get(id)
    if (!def) continue
    const position = DEFAULT_POSITIONS[id]
    api.addPanel({
      id: def.id,
      component: def.component,
      title: def.title,
      ...(position ? { position } : {}),
    })
  }

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
