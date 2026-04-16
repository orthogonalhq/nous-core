'use client'

import * as React from 'react'
import type { ContentRouterRenderProps } from './ContentRouter'

export interface PlaceholderRouteProps extends ContentRouterRenderProps {
  label?: string
}

/**
 * Generic placeholder for routes that are not yet implemented.
 * Renders the route label + "Coming soon" message.
 */
export function PlaceholderRoute({ label }: PlaceholderRouteProps) {
  const isDisabledSection = label
    ? ['TASKS', 'TEAMS', 'AGENTS'].includes(label.toUpperCase())
    : false

  return (
    <div
      data-shell-component="placeholder-route"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 'var(--nous-space-3xl)',
        gap: 'var(--nous-space-md)',
        color: 'var(--nous-text-secondary)',
        opacity: isDisabledSection ? 0.6 : 1,
      }}
    >
      {label ? (
        <span
          style={{
            fontSize: 'var(--nous-font-size-lg, 18px)',
            fontWeight: 'var(--nous-font-weight-medium, 500)',
            color: isDisabledSection ? 'var(--nous-text-ghost)' : 'var(--nous-sidebar-header-fg)',
          }}
        >
          {label}
        </span>
      ) : null}
      <span
        style={{
          fontSize: 'var(--nous-font-size-sm)',
          color: 'var(--nous-text-tertiary)',
        }}
      >
        Coming soon
      </span>
    </div>
  )
}
