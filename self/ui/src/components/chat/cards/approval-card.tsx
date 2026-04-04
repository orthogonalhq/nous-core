'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { z } from 'zod'
import { Card, CardHeader, CardTitle, CardContent } from '../../card'
import { Button } from '../../button'
import { Badge } from '../../badge'
import type { CardRendererProps, CardAction } from '../openui-adapter/types'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const ApprovalCardSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    tier: z.enum(['t1', 't2', 't3']),
    command: z.string(),
    context: z.record(z.unknown()).optional(),
  })
  .strip()

export type ApprovalCardProps = z.infer<typeof ApprovalCardSchema>

// ---------------------------------------------------------------------------
// Token mappings
// ---------------------------------------------------------------------------

const TIER_BORDER_COLOR: Record<ApprovalCardProps['tier'], string> = {
  t1: 'var(--nous-accent)',
  t2: 'var(--nous-alert-warning)',
  t3: 'var(--nous-alert-error)',
}

const TIER_BADGE: Record<
  ApprovalCardProps['tier'],
  { label: string; variant: 'secondary' | 'default'; style?: React.CSSProperties }
> = {
  t1: { label: 'Routine', variant: 'secondary' },
  t2: {
    label: 'Caution',
    variant: 'default',
    style: { background: 'var(--nous-alert-warning)', color: 'var(--nous-fg-on-color)' },
  },
  t3: {
    label: 'Critical',
    variant: 'default',
    style: { background: 'var(--nous-alert-error)', color: 'var(--nous-fg-on-color)' },
  },
}

// ---------------------------------------------------------------------------
// T3 approve delay (2 seconds)
// ---------------------------------------------------------------------------

const T3_DELAY_MS = 2000

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function ApprovalCard({
  props,
  stale,
  actionOutcome,
  onAction,
}: CardRendererProps<unknown>) {
  const result = ApprovalCardSchema.safeParse(props)
  const [t3Unlocked, setT3Unlocked] = useState(false)
  const [countdown, setCountdown] = useState(T3_DELAY_MS / 1000)

  const isT3 = result.success && result.data.tier === 't3'
  const needsDelay = isT3 && !stale

  useEffect(() => {
    if (!needsDelay) return

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    const timer = setTimeout(() => {
      setT3Unlocked(true)
    }, T3_DELAY_MS)

    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [needsDelay])

  const handleAction = useCallback(
    (actionType: 'approve' | 'reject') => {
      if (onAction) {
        const cardAction: CardAction = {
          actionType,
          cardId: '',
          payload: result.success
            ? { command: result.data.command, tier: result.data.tier }
            : {},
        }
        onAction(cardAction)
      }
    },
    [onAction, result],
  )

  if (!result.success) {
    console.warn('[ApprovalCard] Validation failed:', result.error.format(), 'Received props:', props)
    return (
      <div
        data-testid="approval-card-invalid"
        style={{
          padding: 'var(--nous-space-sm)',
          color: 'var(--nous-fg-muted)',
          fontSize: 'var(--nous-font-size-xs)',
        }}
      >
        Invalid approval card data
      </div>
    )
  }

  const data = result.data
  const borderColor = stale ? 'var(--nous-fg-muted)' : TIER_BORDER_COLOR[data.tier]
  const bgColor = stale ? 'var(--nous-bg-surface)' : undefined
  const badge = TIER_BADGE[data.tier]
  const approveDisabled = isT3 && !t3Unlocked && !stale

  return (
    <Card
      data-testid="approval-card"
      style={{
        borderLeft: `3px solid ${borderColor}`,
        ...(bgColor ? { background: bgColor } : {}),
      }}
    >
      <CardHeader>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--nous-space-sm)',
          }}
        >
          <CardTitle style={{ fontSize: 'var(--nous-font-size-sm)' }}>
            {data.title}
          </CardTitle>
          <Badge
            data-testid="approval-tier-badge"
            variant={badge.variant}
            style={badge.style}
          >
            {badge.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div
          style={{
            fontSize: 'var(--nous-font-size-sm)',
            color: 'var(--nous-text-primary)',
            marginBottom: 'var(--nous-space-sm)',
          }}
        >
          {data.description}
        </div>
        <div
          data-testid="approval-command-block"
          style={{
            fontFamily: 'var(--nous-font-mono)',
            fontSize: 'var(--nous-font-size-xs)',
            padding: 'var(--nous-space-sm)',
            background: 'var(--nous-bg-elevated)',
            borderRadius: 'var(--nous-radius-sm)',
            color: 'var(--nous-text-primary)',
            marginBottom: 'var(--nous-space-sm)',
            overflowX: 'auto',
          }}
        >
          {data.command}
        </div>
        {data.context && (
          <div
            data-testid="approval-context"
            style={{
              fontSize: 'var(--nous-font-size-xs)',
              color: 'var(--nous-fg-subtle)',
              marginBottom: 'var(--nous-space-sm)',
            }}
          >
            {Object.entries(data.context).map(([key, value]) => (
              <div key={key}>
                <span style={{ fontWeight: 'var(--nous-font-weight-medium)' as any }}>
                  {key}:
                </span>{' '}
                {String(value)}
              </div>
            ))}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            gap: 'var(--nous-space-xs)',
            alignItems: 'center',
          }}
        >
          {stale && actionOutcome ? (
            <Badge
              data-testid="approval-card-outcome"
              variant="secondary"
            >
              {actionOutcome.label}
            </Badge>
          ) : stale ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled
                data-testid="approval-expired-btn"
              >
                Expired
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="default"
                size="sm"
                disabled={approveDisabled}
                data-testid="approval-approve-btn"
                onClick={() => handleAction('approve')}
              >
                {approveDisabled ? `Approve (${countdown}s)` : 'Approve'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-testid="approval-reject-btn"
                onClick={() => handleAction('reject')}
              >
                Reject
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
