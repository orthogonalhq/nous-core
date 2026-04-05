'use client'

import React from 'react'
import { z } from 'zod'
import { Card, CardHeader, CardTitle, CardContent } from '../../card'
import type { CardRendererProps } from '../openui-adapter/types'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const StatusCardSchema = z
  .object({
    title: z.string(),
    status: z.enum(['active', 'complete', 'error', 'waiting']),
    description: z.string(),
    detail: z.string().optional(),
    progress: z.number().min(0).max(100).optional(),
  })
  .strip()

export type StatusCardProps = z.infer<typeof StatusCardSchema>

// ---------------------------------------------------------------------------
// Token mappings
// ---------------------------------------------------------------------------

const STATUS_BORDER_COLOR: Record<StatusCardProps['status'], string> = {
  active: 'var(--nous-state-active)',
  complete: 'var(--nous-state-complete)',
  error: 'var(--nous-state-blocked)',
  waiting: 'var(--nous-state-waiting)',
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function StatusCard({
  props,
  stale,
  actionOutcome,
}: CardRendererProps<unknown>) {
  const result = StatusCardSchema.safeParse(props)
  if (!result.success) {
    console.warn('[StatusCard] Validation failed:', result.error.format(), 'Received props:', props)
    return (
      <div
        data-testid="status-card-invalid"
        style={{
          padding: 'var(--nous-space-sm)',
          color: 'var(--nous-fg-muted)',
          fontSize: 'var(--nous-font-size-xs)',
        }}
      >
        Invalid status card data
      </div>
    )
  }

  const data = result.data
  const borderColor = stale
    ? 'var(--nous-fg-muted)'
    : STATUS_BORDER_COLOR[data.status]
  const bgColor = stale ? 'var(--nous-bg-surface)' : undefined

  return (
    <Card
      data-testid="status-card"
      style={{
        borderLeft: `3px solid ${borderColor}`,
        ...(bgColor ? { background: bgColor } : {}),
      }}
    >
      <CardHeader>
        <CardTitle
          style={{ fontSize: 'var(--nous-font-size-sm)' }}
        >
          {data.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          style={{
            fontSize: 'var(--nous-font-size-sm)',
            color: 'var(--nous-text-primary)',
          }}
        >
          {data.description}
        </div>
        {data.detail && (
          <div
            style={{
              marginTop: 'var(--nous-space-xs)',
              fontSize: 'var(--nous-font-size-xs)',
              color: 'var(--nous-fg-subtle)',
            }}
          >
            {data.detail}
          </div>
        )}
        {data.progress != null && (
          <div
            data-testid="status-card-progress"
            style={{
              marginTop: 'var(--nous-space-sm)',
              height: '4px',
              borderRadius: 'var(--nous-radius-sm)',
              background: 'var(--nous-bg-elevated)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${data.progress}%`,
                height: '100%',
                background: stale
                  ? 'var(--nous-fg-muted)'
                  : 'var(--nous-state-active)',
                borderRadius: 'var(--nous-radius-sm)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        )}
        {stale && actionOutcome && (
          <div
            data-testid="status-card-outcome"
            style={{
              marginTop: 'var(--nous-space-sm)',
              fontSize: 'var(--nous-font-size-xs)',
              color: 'var(--nous-fg-muted)',
            }}
          >
            {actionOutcome.label}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
