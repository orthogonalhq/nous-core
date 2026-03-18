'use client'

import type { IDockviewPanelProps } from 'dockview-react'

interface AppIframePanelParams {
  appId: string
  panelId: string
  src: string
  preserveState?: boolean
}

interface AppIframePanelProps extends IDockviewPanelProps {
  params: AppIframePanelParams
}

export function AppIframePanel({ params }: AppIframePanelProps) {
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
