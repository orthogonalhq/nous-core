'use client'

import { useEffect, useRef } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import type { AppPanelLifecycleReason, PanelBridgeConfigSnapshot } from '@nous/shared'
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

export function AppIframePanel({ params, api }: AppIframePanelProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const bridgeHostRef = useRef<PanelBridgeHost | null>(null)
  const teardownReasonRef = useRef<AppPanelLifecycleReason | null>(null)

  useEffect(() => {
    if (!api) {
      return
    }

    api.setRenderer(params?.preserveState === false ? 'onlyWhenVisible' : 'always')
  }, [api, params?.preserveState])

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
      lifecycleAdapter: async (input) => {
        const response = await fetch(new URL('/mcp', params.src).toString(), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-nous-panel-bridge': '1',
            'x-nous-panel-bridge-operation': 'panel.lifecycle',
          },
          body: JSON.stringify(input),
        })

        if (!response.ok) {
          throw new Error('Panel lifecycle reconciliation failed.')
        }
      },
    })
    bridgeHostRef.current = bridgeHost

    return () => {
      if (teardownReasonRef.current !== 'host_reload') {
        void bridgeHost.notifyLifecycle(
          'panel_unmount',
          teardownReasonRef.current ?? 'close',
        )
      }
      bridgeHostRef.current = null
      teardownReasonRef.current = null
      bridgeHost.destroy()
    }
  }, [
    params?.appId,
    params?.panelId,
    params?.src,
    JSON.stringify(params?.configSnapshot ?? {}),
  ])

  useEffect(() => {
    if (!api) {
      return
    }

    const disposable = api.onDidActiveChange(({ isActive }) => {
      void bridgeHostRef.current?.notifyLifecycle(
        isActive ? 'panel_mount' : 'panel_unmount',
        isActive ? 'activate' : 'deactivate',
      )
    })

    return () => {
      disposable.dispose()
    }
  }, [api])

  useEffect(() => {
    const handleBeforeUnload = () => {
      teardownReasonRef.current = 'host_reload'
      void bridgeHostRef.current?.notifyLifecycle('panel_unmount', 'host_reload')
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

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
