'use client'

import * as React from 'react'
import type { ContentRouterRenderProps } from '@nous/ui/components'

export function ChatApiAdapter({ navigate, goBack, canGoBack }: ContentRouterRenderProps) {
  return (
    <div
      data-testid="chat-api-adapter"
      style={{
        display: 'flex',
        height: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--nous-space-2xl)',
        color: 'var(--nous-text-secondary)',
        fontFamily: 'var(--nous-font-family)',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          maxWidth: '400px',
        }}
      >
        <h2
          style={{
            fontSize: 'var(--nous-font-size-lg)',
            fontWeight: 'var(--nous-font-weight-bold)',
            color: 'var(--nous-text-primary)',
            marginBottom: 'var(--nous-space-sm)',
          }}
        >
          Chat
        </h2>
        <p
          style={{
            fontSize: 'var(--nous-font-size-sm)',
            color: 'var(--nous-text-secondary)',
          }}
        >
          Chat integration will be connected in Phase 2 when the shell layout is restructured.
        </p>
      </div>
    </div>
  )
}
