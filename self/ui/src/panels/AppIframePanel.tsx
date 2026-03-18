'use client'

import { useEffect, useRef } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import type { PanelBridgeConfigSnapshot } from '@nous/shared'
import { PanelBridgeHost } from './panel-bridge-host'

interface AppIframePanelParams {
  appId: string
  panelId: string
  src: string
  preserveState?: boolean
  configSnapshot?: PanelBridgeConfigSnapshot
}

interface AppIframePanelProps extends IDockviewPanelProps {
  params: AppIframePanelParams
}

export function AppIframePanel({ params }: AppIframePanelProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    if (!params?.src || !iframeRef.current) {
      return
    }

    const bridgeHost = new PanelBridgeHost({
      appId: params.appId,
      panelId: params.panelId,
      iframe: iframeRef.current,
      mcpEndpoint: new URL('/mcp', params.src).toString(),
      configSnapshot: params.configSnapshot ?? {},
    })

    return () => {
      bridgeHost.destroy()
    }
  }, [
    params?.appId,
    params?.panelId,
    params?.src,
    JSON.stringify(params?.configSnapshot ?? {}),
  ])

  if (!params?.src) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--nous-fg-subtle)',
          fontSize: 'var(--nous-font-size-sm)',
          padding: 'var(--nous-space-lg)',
          textAlign: 'center',
        }}
      >
        App panel route unavailable.
      </div>
    )
  }

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: 'var(--nous-bg)',
      }}
    >
      <iframe
        ref={iframeRef}
        title={`${params.appId}:${params.panelId}`}
        src={params.src}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          border: 'none',
          background: 'transparent',
        }}
      />
    </div>
  )
}
