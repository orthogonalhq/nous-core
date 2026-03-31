'use client'

import React from 'react'
import { z } from 'zod'
import { Card, CardHeader, CardTitle, CardContent } from '../../card'
import { Button } from '../../button'
import { Badge } from '../../badge'
import type { CardRendererProps, CardAction } from '../openui-adapter/types'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const ActionCardSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    actions: z
      .array(
        z.object({
          label: z.string(),
          actionType: z.enum(['approve', 'reject', 'navigate', 'followup']),
          payload: z.record(z.unknown()).optional(),
          variant: z.enum(['primary', 'secondary', 'ghost']).default('secondary'),
        }),
      )
      .min(1)
      .max(4),
  })
  .strip()

export type ActionCardProps = z.infer<typeof ActionCardSchema>

// ---------------------------------------------------------------------------
// Variant mapping: schema names -> Button component variants
// ---------------------------------------------------------------------------

const VARIANT_MAP: Record<string, 'default' | 'outline' | 'ghost'> = {
  primary: 'default',
  secondary: 'outline',
  ghost: 'ghost',
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function ActionCard({
  props,
  stale,
  actionOutcome,
  onAction,
}: CardRendererProps<unknown>) {
  const result = ActionCardSchema.safeParse(props)
  if (!result.success) {
    return (
      <div
        data-testid="action-card-invalid"
        style={{
          padding: 'var(--nous-space-sm)',
          color: 'var(--nous-fg-muted)',
          fontSize: 'var(--nous-font-size-xs)',
        }}
      >
        Invalid action card data
      </div>
    )
  }

  const data = result.data
  const borderColor = stale ? 'var(--nous-fg-muted)' : undefined
  const bgColor = stale ? 'var(--nous-bg-surface)' : undefined

  return (
    <Card
      data-testid="action-card"
      style={{
        ...(borderColor ? { borderColor } : {}),
        ...(bgColor ? { background: bgColor } : {}),
      }}
    >
      <CardHeader>
        <CardTitle style={{ fontSize: 'var(--nous-font-size-sm)' }}>
          {data.title}
        </CardTitle>
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
          style={{
            display: 'flex',
            gap: 'var(--nous-space-xs)',
            flexWrap: 'wrap',
          }}
        >
          {stale && actionOutcome ? (
            <Badge
              data-testid="action-card-outcome"
              variant="secondary"
            >
              {actionOutcome.label}
            </Badge>
          ) : stale ? (
            data.actions.map((action, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                disabled
                data-testid="action-card-expired-btn"
              >
                Expired
              </Button>
            ))
          ) : (
            data.actions.map((action, i) => (
              <Button
                key={i}
                variant={VARIANT_MAP[action.variant] ?? 'outline'}
                size="sm"
                data-testid={`action-btn-${action.actionType}`}
                onClick={() => {
                  if (onAction) {
                    const cardAction: CardAction = {
                      actionType: action.actionType,
                      cardId: '',
                      payload: action.payload ?? {},
                    }
                    onAction(cardAction)
                  }
                }}
              >
                {action.label}
              </Button>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
