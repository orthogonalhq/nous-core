'use client'

import { useState, useCallback, type CSSProperties } from 'react'
import { trpc, useEventSubscription } from '@nous/transport'
import type { ProjectId } from '@nous/shared'

interface BannerState {
  visible: boolean
  projectId: string
  currentSpendUsd: number
  budgetCeilingUsd: number
}

const bannerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--nous-space-md)',
  padding: 'var(--nous-space-sm) var(--nous-space-xl)',
  background: 'var(--nous-state-blocked)',
  color: 'var(--nous-fg-on-accent)',
  fontSize: 'var(--nous-font-size-sm)',
  fontWeight: 'var(--nous-font-weight-semibold)' as any,
  minHeight: '36px',
}

const buttonStyle: CSSProperties = {
  padding: 'var(--nous-space-2xs) var(--nous-space-md)',
  borderRadius: 'var(--nous-menu-content-radius)',
  border: '1px solid currentColor',
  background: 'transparent',
  color: 'inherit',
  fontSize: 'var(--nous-font-size-xs)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

export function BudgetExceededBanner() {
  const [banner, setBanner] = useState<BannerState>({
    visible: false,
    projectId: '',
    currentSpendUsd: 0,
    budgetCeilingUsd: 0,
  })

  const setBudgetMutation = trpc.cost.setBudgetPolicy.useMutation()
  const controlMutation = trpc.mao.requestProjectControl.useMutation()
  const trpcUtils = trpc.useUtils()

  useEventSubscription({
    channels: ['notification:raised'],
    onEvent: (_channel: string, payload: unknown) => {
      const data = payload as { kind: string; id: string }
      if (data.kind !== 'alert') return
      void trpcUtils.notifications.get.fetch({ id: data.id }).then((record) => {
        if (!record || record.kind !== 'alert' || record.alert.category !== 'budget-exceeded') return
        setBanner({
          visible: true,
          projectId: record.projectId ?? '',
          currentSpendUsd: record.alert.currentSpendUsd,
          budgetCeilingUsd: record.alert.budgetCeilingUsd,
        })
      })
    },
  })

  const handleIncreaseBudget = useCallback(() => {
    if (!banner.projectId) return
    const newCeiling = banner.budgetCeilingUsd * 2
    setBudgetMutation.mutate({
      projectId: banner.projectId,
      policy: {
        enabled: true,
        period: 'monthly',
        softThresholdPercent: 80,
        hardCeilingUsd: newCeiling,
      },
    })
    setBanner((prev) => ({ ...prev, visible: false }))
  }, [banner.projectId, banner.budgetCeilingUsd, setBudgetMutation])

  const handleResume = useCallback(() => {
    if (!banner.projectId) return
    const now = new Date().toISOString()
    controlMutation.mutate({
      request: {
        command_id: crypto.randomUUID(),
        project_id: banner.projectId as ProjectId,
        action: 'resume_project',
        actor_id: 'principal-operator',
        actor_type: 'operator',
        reason: 'Budget exceeded — operator initiated resume',
        requested_at: now,
        impactSummary: {
          activeRunCount: 0,
          activeAgentCount: 0,
          blockedAgentCount: 0,
          urgentAgentCount: 0,
          affectedScheduleCount: 0,
          evidenceRefs: [],
        },
      },
    })
    setBanner((prev) => ({ ...prev, visible: false }))
  }, [banner.projectId, controlMutation])

  if (!banner.visible) return null

  return (
    <div style={bannerStyle} role="alert" data-testid="budget-exceeded-banner">
      <span style={{ flex: 1 }}>
        Budget exceeded: project has been paused. ${banner.currentSpendUsd.toFixed(2)} / ${banner.budgetCeilingUsd.toFixed(2)}
      </span>
      <div style={{ display: 'flex', gap: 'var(--nous-space-sm)' }}>
        <button
          onClick={handleIncreaseBudget}
          style={buttonStyle}
          data-testid="banner-increase-budget"
        >
          Increase Budget
        </button>
        <button
          onClick={handleResume}
          style={buttonStyle}
          data-testid="banner-resume"
        >
          Resume
        </button>
      </div>
    </div>
  )
}
